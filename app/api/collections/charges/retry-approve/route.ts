import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { formatZodError } from '@/lib/format-zod-error'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { approveGrowTransaction } from '@/lib/grow-client'
import { recordGrowApproveResult } from '@/lib/collection-charge-ops'

const bodySchema = z.object({
  charge_id: z.string().uuid(),
})

/**
 * Retry Grow ApproveTransaction when the charge is already paid but approve failed.
 * Requires grow_transaction_id + grow_transaction_token from the original S2S callback.
 */
export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections, { write: true })
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'collections-retry-approve'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const validated = bodySchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }
  const { data: charge, error } = await admin
    .from('collection_charges')
    .select(
      'id, status, grow_transaction_id, grow_transaction_token, grow_approve_status'
    )
    .eq('id', validated.data.charge_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!charge) {
    return NextResponse.json({ error: 'חיוב לא נמצא' }, { status: 404 })
  }
  if (charge.status !== 'paid') {
    return NextResponse.json(
      { error: 'אפשר לאשר עסקה ב-Grow רק אחרי שהחיוב מסומן כשולם' },
      { status: 409 }
    )
  }
  if (!charge.grow_transaction_id || !charge.grow_transaction_token) {
    return NextResponse.json(
      {
        error:
          'חסרים מזהי עסקה מ-Grow (transactionId/token). נדרש callback מקורי — לא ניתן לאשר מסימולציה.',
        code: 'MISSING_TX_TOKEN',
      },
      { status: 409 }
    )
  }
  if (charge.grow_approve_status === 'ok') {
    return NextResponse.json({ ok: true, already: true, approve_status: 'ok' })
  }

  const approved = await approveGrowTransaction({
    transactionId: charge.grow_transaction_id,
    transactionToken: charge.grow_transaction_token,
  })

  await recordGrowApproveResult(admin, {
    chargeIds: [charge.id],
    ok: approved.ok,
    error: approved.error,
    transactionId: charge.grow_transaction_id,
  })

  if (!approved.ok) {
    return NextResponse.json(
      { error: approved.error || 'אישור העסקה ב-Grow נכשל', approve_status: 'failed' },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true, approve_status: 'ok' })
}
