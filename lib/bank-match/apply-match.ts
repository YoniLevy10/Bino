import type { SupabaseClient } from '@supabase/supabase-js'
import { logAudit } from '@/lib/audit'
import { postLedgerEntry, postLedgerPaymentForCharge } from '@/lib/unit-ledger'

export type ApplyMatchResult =
  | { ok: true; chargeId: string; transactionId: string }
  | { ok: false; error: string }

/**
 * Link bank tx → charge, mark paid + funds received, post ledger.
 * Guards: charge not already bank-linked / paid via other path with bank_transaction_id.
 */
export async function applyBankMatch(params: {
  admin: SupabaseClient
  clientId: string
  projectId: string
  transactionId: string
  chargeId: string
  confidence: string
  actorUserId?: string | null
  auto?: boolean
}): Promise<ApplyMatchResult> {
  const {
    admin,
    clientId,
    projectId,
    transactionId,
    chargeId,
    confidence,
    actorUserId,
    auto,
  } = params

  const { data: tx, error: txErr } = await admin
    .from('bank_transactions')
    .select('id, client_id, project_id, amount, match_status, matched_charge_id, direction')
    .eq('id', transactionId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (txErr || !tx) return { ok: false, error: 'תנועה לא נמצאה' }
  if (tx.project_id && tx.project_id !== projectId) {
    return { ok: false, error: 'תנועה לא שייכת לבניין' }
  }
  if (tx.match_status === 'matched_charge' && tx.matched_charge_id) {
    if (tx.matched_charge_id === chargeId) {
      return { ok: true, chargeId, transactionId }
    }
    return { ok: false, error: 'התנועה כבר משויכת לחיוב אחר' }
  }
  if (tx.direction === 'debit') {
    return { ok: false, error: 'לא ניתן לשייך תנועת חובה לגבייה' }
  }

  const { data: charge, error: chErr } = await admin
    .from('collection_charges')
    .select(
      'id, client_id, project_id, status, amount, bank_transaction_id, paid_at, unit_id, resident_id, period_label, title'
    )
    .eq('id', chargeId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (chErr || !charge) return { ok: false, error: 'חיוב לא נמצא' }
  if (charge.project_id && charge.project_id !== projectId) {
    return { ok: false, error: 'חיוב לא שייך לבניין' }
  }
  if (charge.bank_transaction_id && charge.bank_transaction_id !== transactionId) {
    return { ok: false, error: 'החיוב כבר מקושר לתנועת בנק אחרת' }
  }
  if (charge.status === 'paid' && charge.bank_transaction_id) {
    return { ok: true, chargeId, transactionId }
  }
  if (charge.status === 'paid' && !charge.bank_transaction_id) {
    // Paid via Grow/other — do not double-count funds as another full payment
    return {
      ok: false,
      error: 'החיוב כבר מסומן שולם במסלול אחר (למשל Grow). בטלו או התאימו ידנית בזהירות.',
    }
  }
  if (Math.abs(Number(charge.amount) - Number(tx.amount)) >= 0.009) {
    return { ok: false, error: 'סכום התנועה אינו תואם לחיוב' }
  }

  const now = new Date().toISOString()

  const { error: txUpErr } = await admin
    .from('bank_transactions')
    .update({
      match_status: 'matched_charge',
      matched_charge_id: chargeId,
      suggested_charge_id: null,
      match_confidence: confidence,
      matched_at: now,
      matched_by: actorUserId || null,
    })
    .eq('id', transactionId)
    .eq('client_id', clientId)

  if (txUpErr) return { ok: false, error: txUpErr.message }

  const { error: chUpErr } = await admin
    .from('collection_charges')
    .update({
      status: 'paid',
      paid_at: now,
      payment_confirmed_at: now,
      payment_confirm_source: 'bank_match',
      funds_received_at: now,
      bank_transaction_id: transactionId,
      updated_at: now,
    })
    .eq('id', chargeId)
    .eq('client_id', clientId)

  if (chUpErr) {
    await admin
      .from('bank_transactions')
      .update({
        match_status: 'unmatched',
        matched_charge_id: null,
        match_confidence: null,
        matched_at: null,
        matched_by: null,
      })
      .eq('id', transactionId)
    return { ok: false, error: chUpErr.message }
  }

  const ledger = await postLedgerPaymentForCharge(admin, {
    charge: {
      id: charge.id as string,
      client_id: charge.client_id as string,
      project_id: (charge.project_id as string) || projectId,
      resident_id: (charge.resident_id as string | null) || null,
      unit_id: (charge.unit_id as string | null) || null,
      title: (charge.title as string) || 'גבייה',
      amount: Number(charge.amount),
      period_label: (charge.period_label as string | null) || null,
      status: 'paid',
      paid_at: now,
    },
    amount: Number(charge.amount),
    idempotencyKey: `bank_match:${transactionId}`,
    paymentMethod: 'transfer',
    description: 'תשלום — התאמת בנק',
    createdBy: actorUserId || null,
    clampToRemaining: true,
  })
  if (!ledger.ok) {
    return { ok: false, error: ledger.error }
  }

  await logAudit({
    clientId,
    userId: actorUserId || null,
    action: auto ? 'bank_match.auto' : 'bank_match.apply',
    entityType: 'collection_charge',
    entityId: chargeId,
    newValues: {
      transaction_id: transactionId,
      confidence,
      amount: charge.amount,
    },
  })

  return { ok: true, chargeId, transactionId }
}

export async function unmatchBankMatch(params: {
  admin: SupabaseClient
  clientId: string
  projectId: string
  transactionId: string
  actorUserId?: string | null
}): Promise<ApplyMatchResult> {
  const { admin, clientId, projectId, transactionId, actorUserId } = params

  const { data: tx } = await admin
    .from('bank_transactions')
    .select('id, matched_charge_id, match_status, amount')
    .eq('id', transactionId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!tx?.matched_charge_id || tx.match_status !== 'matched_charge') {
    return { ok: false, error: 'אין התאמה פעילה לביטול' }
  }

  const chargeId = tx.matched_charge_id as string
  const { data: charge } = await admin
    .from('collection_charges')
    .select('id, project_id, amount, status, bank_transaction_id, unit_id, resident_id')
    .eq('id', chargeId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!charge) return { ok: false, error: 'חיוב לא נמצא' }
  if (charge.project_id && charge.project_id !== projectId) {
    return { ok: false, error: 'חיוב לא שייך לבניין' }
  }

  const now = new Date().toISOString()

  await admin
    .from('bank_transactions')
    .update({
      match_status: 'unmatched_after_revoke',
      matched_charge_id: null,
      suggested_charge_id: null,
      match_confidence: null,
      matched_at: null,
      matched_by: null,
    })
    .eq('id', transactionId)

  await admin
    .from('collection_charges')
    .update({
      status: 'sent',
      paid_at: null,
      payment_confirmed_at: null,
      payment_confirm_source: null,
      funds_received_at: null,
      bank_transaction_id: null,
      updated_at: now,
    })
    .eq('id', chargeId)

  // Restore debt after removing the bank payment line (charge entry increases debt).
  if (charge.unit_id || charge.resident_id) {
    await postLedgerEntry(admin, {
      clientId,
      projectId,
      unitId: (charge.unit_id as string | null) || null,
      residentId: (charge.resident_id as string | null) || null,
      entryType: 'charge',
      amount: Number(charge.amount),
      chargeId,
      paymentMethod: 'transfer',
      description: 'ביטול התאמת בנק — החזרת חוב',
      idempotencyKey: `bank_unmatch:${transactionId}`,
      createdBy: actorUserId || null,
    })
  }

  await logAudit({
    clientId,
    userId: actorUserId || null,
    action: 'bank_match.unmatch',
    entityType: 'collection_charge',
    entityId: chargeId,
    oldValues: { transaction_id: transactionId },
  })

  return { ok: true, chargeId, transactionId }
}
