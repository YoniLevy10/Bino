import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { resendCollectionChargeBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { sendCollectionReceiptEmailIfNeeded } from '@/lib/collection-receipt-email'

/**
 * POST — resend BINO payment confirmation email (Resend) for a paid charge.
 * Used when webhook fire-and-forget dropped the first attempt.
 */
export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections, { write: true })
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'collections-resend-receipt'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const validated = resendCollectionChargeBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const { data: charge, error } = await admin
    .from('collection_charges')
    .select('id, status, receipt_email, receipt_email_sent_at')
    .eq('id', validated.data.charge_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (error || !charge) {
    return NextResponse.json({ error: 'חיוב לא נמצא' }, { status: 404 })
  }

  if (charge.status !== 'paid') {
    return NextResponse.json({ error: 'אפשר לשלוח אישור רק לחיוב ששולם' }, { status: 400 })
  }
  if (!(charge.receipt_email || '').trim()) {
    return NextResponse.json(
      { error: 'אין מייל שמור על החיוב — הדייר צריך להזין מייל ב-/pay' },
      { status: 400 }
    )
  }

  // Allow forced resend: clear stamp if already sent so the helper can send again.
  if (charge.receipt_email_sent_at) {
    await admin
      .from('collection_charges')
      .update({ receipt_email_sent_at: null, updated_at: new Date().toISOString() })
      .eq('id', charge.id)
      .eq('client_id', auth.ctx.clientId)
  }

  const result = await sendCollectionReceiptEmailIfNeeded(admin, charge.id)
  if (!result.sent) {
    return NextResponse.json(
      {
        error: result.error || result.skipped || 'שליחת המייל נכשלה',
        skipped: result.skipped || null,
      },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true, sent: true })
}
