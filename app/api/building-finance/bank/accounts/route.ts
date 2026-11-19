import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/auth-api/api-auth'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { isFinancyBankSyncEnabled } from '@/lib/bank/flags'
import {
  hydrateBankAccountRow,
  type BankAccountApiRow,
} from '@/lib/bank/hydrate-bank-account'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyBankSyncEnabled()) {
    return NextResponse.json(
      { error: 'חשבון בנק כבוי בפלטפורמה', code: 'FINANCY_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  // Bank is client-wide — ignore project_id so building-scoped callers still see AIS data.
  const limitRaw = Number(url.searchParams.get('limit') || '50')
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 50

  const admin = getSupabaseAdmin()
  // Fetch raw so we can hydrate name/balance from Financy AIS shape when columns are null.
  const { data, error } = await admin
    .from('bank_accounts')
    .select(
      'id, project_id, external_account_id, connection_id, account_type, display_name, currency, balance, synced_at, raw'
    )
    .eq('client_id', auth.ctx.clientId)
    .order('synced_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const accounts = ((data || []) as BankAccountApiRow[])
    .map(hydrateBankAccountRow)
    .filter((row): row is BankAccountApiRow => row != null)

  return NextResponse.json({ accounts })
}
