import type { SupabaseClient } from '@supabase/supabase-js'
import { decideMatch } from '@/lib/bank-match/match-engine'
import { applyBankMatch } from '@/lib/bank-match/apply-match'
import type { MatchCandidateCharge } from '@/lib/bank-match/types'

export async function runMatchPassForProject(params: {
  admin: SupabaseClient
  clientId: string
  projectId: string
  applyAuto?: boolean
  actorUserId?: string | null
}): Promise<{
  scanned: number
  autoApplied: number
  suggested: number
  none: number
  errors: string[]
}> {
  const { admin, clientId, projectId, applyAuto = true, actorUserId } = params
  const errors: string[] = []

  const { data: txs } = await admin
    .from('bank_transactions')
    .select(
      'id, amount, direction, description, reference, counterparty, match_status, booked_at'
    )
    .eq('client_id', clientId)
    .eq('project_id', projectId)
    .in('match_status', ['unmatched', 'suggested', 'unmatched_after_revoke'])
    .eq('direction', 'credit')
    .order('booked_at', { ascending: false })
    .limit(200)

  const { data: chargeRows } = await admin
    .from('collection_charges')
    .select(
      `
      id, amount, status, payment_reference, period_label, resident_id,
      bank_transaction_id, paid_at, unit_id,
      residents ( full_name, apartment_number )
    `
    )
    .eq('client_id', clientId)
    .eq('project_id', projectId)
    .in('status', ['sent', 'draft'])
    .limit(500)

  const charges: MatchCandidateCharge[] = (chargeRows || []).map((c) => {
    const res = c.residents as
      | { full_name?: string; apartment_number?: string | null }
      | { full_name?: string; apartment_number?: string | null }[]
      | null
    const r = Array.isArray(res) ? res[0] : res
    return {
      id: c.id as string,
      amount: Number(c.amount),
      status: c.status as string,
      payment_reference: (c.payment_reference as string | null) || null,
      period_label: (c.period_label as string | null) || null,
      resident_id: (c.resident_id as string | null) || null,
      apartment_number: r?.apartment_number || null,
      resident_name: r?.full_name || null,
      bank_transaction_id: (c.bank_transaction_id as string | null) || null,
      paid_at: (c.paid_at as string | null) || null,
    }
  })

  let autoApplied = 0
  let suggested = 0
  let none = 0

  for (const tx of txs || []) {
    const decision = decideMatch({
      tx: {
        amount: Number(tx.amount),
        direction: (tx.direction as 'credit' | 'debit') || 'credit',
        description: tx.description as string | null,
        reference: tx.reference as string | null,
        counterparty: tx.counterparty as string | null,
      },
      charges,
    })

    if (decision.kind === 'auto') {
      if (applyAuto) {
        const applied = await applyBankMatch({
          admin,
          clientId,
          projectId,
          transactionId: tx.id as string,
          chargeId: decision.chargeId,
          confidence: decision.confidence,
          actorUserId,
          auto: true,
        })
        if (applied.ok) {
          autoApplied++
          const ch = charges.find((c) => c.id === decision.chargeId)
          if (ch) {
            ch.bank_transaction_id = tx.id as string
            ch.paid_at = new Date().toISOString()
            ch.status = 'paid'
          }
        } else {
          errors.push(applied.error)
        }
      } else {
        suggested++
      }
    } else if (decision.kind === 'suggested') {
      suggested++
      await admin
        .from('bank_transactions')
        .update({
          match_status: 'suggested',
          suggested_charge_id: decision.chargeId,
          match_confidence: 'C',
        })
        .eq('id', tx.id)
        .eq('client_id', clientId)
    } else {
      none++
    }
  }

  return {
    scanned: (txs || []).length,
    autoApplied,
    suggested,
    none,
    errors,
  }
}
