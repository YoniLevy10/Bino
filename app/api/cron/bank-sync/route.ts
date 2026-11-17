import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isFinancyBankSyncEnabled } from '@/lib/bank/flags'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { isFinancyCredentialsComplete } from '@/lib/bank/financy-auth'
import { syncFinancyAccountsAndTransactions } from '@/lib/bank/sync-accounts-transactions'

export const dynamic = 'force-dynamic'

/**
 * Nightly AIS sync for tenants with financy_enabled + credentials.
 * Bounded: max 20 clients per run, 90-day window, page caps inside sync.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isBuildingFinancePlatformEnabled() || !isFinancyBankSyncEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'disabled' })
  }

  const admin = getSupabaseAdmin()
  const { data: clients, error } = await admin
    .from('clients')
    .select(
      'id, financy_enabled, financy_client_id, financy_client_secret, financy_user_id'
    )
    .eq('financy_enabled', true)
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<Record<string, unknown>> = []
  for (const row of clients || []) {
    const creds = {
      clientId: row.financy_client_id || '',
      clientSecret: row.financy_client_secret || '',
      userId: row.financy_user_id || '',
    }
    if (!isFinancyCredentialsComplete(creds)) {
      results.push({ client_id: row.id, skipped: 'incomplete_creds' })
      continue
    }
    const sync = await syncFinancyAccountsAndTransactions({
      admin,
      clientId: row.id,
      creds,
    })
    results.push({
      client_id: row.id,
      accountsUpserted: sync.accountsUpserted,
      transactionsUpserted: sync.transactionsUpserted,
      error_count: sync.errors.length,
    })
  }

  return NextResponse.json({ ok: true, synced: results.length, results })
}
