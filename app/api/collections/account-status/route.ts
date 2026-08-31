import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { getConfiguredGrowWebhookUrl } from '@/lib/collection-charge-ops'
import {
  CLIENT_GROW_LEGAL_SETTINGS_SELECT,
  getClientGrowPagePath,
  growLegalFromClientRow,
} from '@/lib/client-grow-legal'
import {
  CLIENT_GROW_PAYMENTS_SELECT,
  buildGrowCollectionsAccountStatus,
  type ClientGrowPaymentsRow,
} from '@/lib/grow-credentials'
import { isGrowPlatformConfigured } from '@/lib/grow-config'

/** Per-tenant Grow account readiness — money settles in the client's Grow userId. */
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
    .select(`${CLIENT_GROW_PAYMENTS_SELECT}, id, name, ${CLIENT_GROW_LEGAL_SETTINGS_SELECT}`)
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const row = data as ClientGrowPaymentsRow & {
    id: string
    name?: string | null
    grow_legal_business_name?: string | null
    grow_legal_phone?: string | null
    grow_legal_address?: string | null
    grow_legal_email?: string | null
  }
  const status = buildGrowCollectionsAccountStatus({
    platformConfigured: isGrowPlatformConfigured(),
    enabled: row.grow_enabled === true,
    userId: row.grow_user_id,
  })
  const webhook = getConfiguredGrowWebhookUrl()
  const growLegal = growLegalFromClientRow(row)

  return NextResponse.json({
    ...status,
    webhook_configured: webhook.ok,
    webhook_error: webhook.ok ? null : webhook.error,
    grow_legal_ready: growLegal.ready,
    grow_page_path: getClientGrowPagePath(auth.ctx.clientId),
    settings_path: '/settings?tab=grow',
  })
}
