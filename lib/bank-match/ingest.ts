import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedBankTransaction } from '@/lib/bank-match/types'

export type IngestResult = {
  upserted: number
  skipped: number
  errors: string[]
}

/**
 * Upsert normalized transactions scoped to client + project.
 * Does not overwrite match_status on conflict.
 */
export async function ingestNormalizedTransactions(params: {
  admin: SupabaseClient
  clientId: string
  projectId: string
  rows: NormalizedBankTransaction[]
}): Promise<IngestResult> {
  const { admin, clientId, projectId, rows } = params
  const errors: string[] = []
  let upserted = 0
  let skipped = 0

  // Ensure a synthetic bank_accounts row for CSV scope (optional FK).
  const externalAccountId = `csv:${projectId}`
  const { data: acct } = await admin
    .from('bank_accounts')
    .upsert(
      {
        client_id: clientId,
        project_id: projectId,
        provider: 'csv',
        external_account_id: externalAccountId,
        display_name: 'ייבוא CSV — גבייה',
        currency: 'ILS',
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,external_account_id' }
    )
    .select('id')
    .maybeSingle()

  const bankAccountId = acct?.id as string | undefined

  for (const row of rows) {
    if (row.project_id !== projectId) {
      skipped++
      continue
    }
    const payload = {
      client_id: clientId,
      project_id: projectId,
      bank_account_id: bankAccountId || null,
      external_id: row.external_sk,
      external_sk: row.external_sk,
      amount: row.amount,
      currency: row.currency || 'ILS',
      booked_at: row.booked_at,
      description: row.description,
      merchant_name: row.counterparty,
      reference: row.reference,
      counterparty: row.counterparty,
      direction: row.direction,
      source: row.source,
      synced_at: new Date().toISOString(),
    }

    const { data: existing } = await admin
      .from('bank_transactions')
      .select('id, match_status')
      .eq('client_id', clientId)
      .eq('project_id', projectId)
      .eq('external_sk', row.external_sk)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await admin
        .from('bank_transactions')
        .update({
          amount: payload.amount,
          booked_at: payload.booked_at,
          description: payload.description,
          merchant_name: payload.merchant_name,
          reference: payload.reference,
          counterparty: payload.counterparty,
          direction: payload.direction,
          source: payload.source,
          synced_at: payload.synced_at,
        })
        .eq('id', existing.id)
      if (error) {
        errors.push(error.message)
      } else {
        upserted++
      }
      continue
    }

    const { error } = await admin.from('bank_transactions').insert({
      ...payload,
      match_status: 'unmatched',
    })
    if (error) {
      // Fallback for DBs that only have unique (client_id, external_sk)
      if (/duplicate|unique/i.test(error.message)) {
        skipped++
      } else {
        errors.push(error.message)
      }
    } else {
      upserted++
    }
  }

  await admin
    .from('building_bank_accounts')
    .update({
      last_import_at: new Date().toISOString(),
      connection_status: 'ok',
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('client_id', clientId)
    .eq('project_id', projectId)
    .eq('is_active', true)

  return { upserted, skipped, errors }
}
