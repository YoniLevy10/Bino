import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { postUnitLedgerPaymentBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import {
  COLLECTION_CHARGE_ROW_SELECT,
  type CollectionChargeRow,
  type CollectionChargeStatus,
} from '@/lib/collection-charges'
import {
  chargeAnchorFromRow,
  ledgerIdempotencyKey,
  postLedgerPaymentForCharge,
} from '@/lib/unit-ledger'

/** POST — record partial/full offline payment against a charge → ledger + maybe mark paid. */
export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections, { write: true })
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'collections-ledger-payment'
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

  const validated = postUnitLedgerPaymentBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const body = validated.data
  const { data: charge, error } = await admin
    .from('collection_charges')
    .select(COLLECTION_CHARGE_ROW_SELECT)
    .eq('id', body.charge_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (error || !charge) {
    return NextResponse.json({ error: 'חיוב לא נמצא' }, { status: 404 })
  }

  const row = charge as unknown as CollectionChargeRow
  if (row.status === 'cancelled') {
    return NextResponse.json({ error: 'לא ניתן לרשום תשלום לחיוב מבוטל' }, { status: 400 })
  }
  if (row.status === 'draft') {
    return NextResponse.json(
      { error: 'שלחו את החיוב לתשלום לפני רישום תשלום חלקי' },
      { status: 400 }
    )
  }

  const clientKey = (body.idempotency_key || '').trim() || randomUUID()
  const idempotencyKey = ledgerIdempotencyKey('partial', row.id, clientKey)

  const posted = await postLedgerPaymentForCharge(admin, {
    charge: chargeAnchorFromRow(row),
    amount: body.amount,
    idempotencyKey,
    paymentMethod: body.payment_method || 'other',
    receiptNote: body.receipt_note || null,
    createdBy: auth.ctx.userId,
    clampToRemaining: true,
  })

  if (!posted.ok) {
    return NextResponse.json({ error: posted.error }, { status: 400 })
  }

  let updatedCharge = row
  if (posted.fullyPaid && row.status !== 'paid') {
    const paidAt = new Date().toISOString()
    const { data: updated, error: updErr } = await admin
      .from('collection_charges')
      .update({
        status: 'paid' satisfies CollectionChargeStatus,
        paid_at: paidAt,
        updated_at: paidAt,
      })
      .eq('id', row.id)
      .eq('client_id', auth.ctx.clientId)
      .neq('status', 'paid')
      .select(COLLECTION_CHARGE_ROW_SELECT)
      .maybeSingle()
    if (updErr) {
      console.error('[collections/ledger/payment] mark paid failed', row.id, updErr.message)
    } else if (updated) {
      updatedCharge = updated as unknown as CollectionChargeRow
    }
  }

  return NextResponse.json({
    ok: true,
    entry: posted.entry,
    replay: posted.replay,
    remaining: posted.remaining,
    paid_toward: posted.paidToward,
    fully_paid: posted.fullyPaid,
    charge: updatedCharge,
  })
}
