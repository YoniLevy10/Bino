import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/auth-api/api-auth'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { getFinancyFlagSnapshot, isFinancyBankSyncEnabled } from '@/lib/bank/flags'
import { loadClientFinancyCredentials, financySettingsUrl } from '@/lib/bank/financy-credentials'
import { formatFinancyError } from '@/lib/bank/financy-errors'
import { getStatus, listConnections } from '@/lib/bank/financy-gateway'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyBankSyncEnabled()) {
    return NextResponse.json(
      { error: 'חשבון בנק כבוי בפלטפורמה', code: 'FINANCY_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const loaded = await loadClientFinancyCredentials(admin, auth.ctx.clientId)
  if (!loaded.ok) {
    return NextResponse.json(
      { error: formatFinancyError({ message: loaded.error }), code: 'FINANCY_STATUS_FAILED' },
      { status: 500 }
    )
  }

  const flags = getFinancyFlagSnapshot()
  const base = {
    flags,
    settings_url: financySettingsUrl(),
    mcp_url: 'https://mcp.open-finance.ai/mcp',
    client_id: auth.ctx.clientId,
    enabled: loaded.enabled,
    configured: Boolean(loaded.creds),
    /** Non-secret ids for the connect form (never return secret). */
    financy_client_id: loaded.row.financy_client_id || null,
    financy_user_id: loaded.row.financy_user_id || null,
    has_client_id: Boolean(loaded.row.financy_client_id),
    has_user_id: Boolean(loaded.row.financy_user_id),
    has_secret: Boolean(loaded.row.financy_client_secret),
  }

  if (!loaded.enabled || !loaded.creds) {
    return NextResponse.json({
      ...base,
      connections: [],
      remote_status: null,
      message:
        'לחצו «חבר חשבון Financy» — פתחו Settings, חברו בנק, העתיקו מפתחות API והדביקו כאן.',
    })
  }

  const [connections, status] = await Promise.all([
    listConnections(loaded.creds, { limit: 20 }),
    getStatus(loaded.creds),
  ])

  return NextResponse.json({
    ...base,
    connections: connections.ok ? connections.data.items : [],
    connections_error: connections.ok ? null : connections.error,
    remote_status: status.ok ? status.data : null,
    remote_status_error: status.ok ? null : status.error,
  })
}
