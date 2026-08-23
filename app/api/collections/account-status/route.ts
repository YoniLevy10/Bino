import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { CLIENT_GREENINVOICE_SELECT } from '@/lib/greeninvoice-credentials'
import { collectionsAccountStatusFromClientRow } from '@/lib/greeninvoice-tenant-account'
import { getConfiguredGreenInvoiceWebhookUrl } from '@/lib/collection-charge-ops'
import {
  CLIENT_GROW_LEGAL_SETTINGS_SELECT,
  getClientGrowPagePath,
  growLegalFromClientRow,
} from '@/lib/client-grow-legal'

/** Per-tenant Morning account readiness — each client must use their own keys. */
export async function GET() {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(
    admin,
    auth.ctx.userId,
    'collections-account-status'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const { data, error } = await admin
    .from('clients')
    .select(`${CLIENT_GREENINVOICE_SELECT}, id, name, ${CLIENT_GROW_LEGAL_SETTINGS_SELECT}`)
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const status = collectionsAccountStatusFromClientRow(data)
  const webhook = getConfiguredGreenInvoiceWebhookUrl()
  const growLegal = growLegalFromClientRow(data)

  return NextResponse.json({
    ...status,
    webhook_configured: webhook.ok,
    webhook_error: webhook.ok ? null : webhook.error,
    grow_legal_ready: growLegal.ready,
    grow_page_path: getClientGrowPagePath(auth.ctx.clientId),
    settings_path: '/settings?tab=morning',
  })
}
