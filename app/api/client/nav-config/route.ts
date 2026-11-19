import { NextResponse } from 'next/server'
import { requireSessionClientIdLite } from '@/lib/auth-api/api-auth'
import { parseEnabledNavFeaturesFromDb } from '@/lib/client/client-nav-features'
import { isPalGateAccessAllowed } from '@/lib/palgate/access'
import {
  DEFAULT_SIDEBAR_NAV_ORDER,
  parseSidebarNavOrderFromDb,
  parseSidebarNavLabelsFromDb,
  type SidebarNavItemId,
} from '@/lib/sidebar-nav'

/** Inject חניונים for Savion pilot only — never persist into other tenants' DB order. */
function withParkingPilotOrder(
  order: SidebarNavItemId[] | null,
  pilot: boolean
): SidebarNavItemId[] | null {
  if (!pilot) {
    if (!order?.length) return order
    const filtered = order.filter((id) => id !== 'parking')
    return filtered.length > 0 ? filtered : null
  }
  const base = order?.length ? [...order] : [...DEFAULT_SIDEBAR_NAV_ORDER]
  if (!base.includes('parking')) {
    const ticketsIdx = base.indexOf('tickets')
    if (ticketsIdx >= 0) base.splice(ticketsIdx + 1, 0, 'parking')
    else base.push('parking')
  }
  return base
}

/** Tenant nav order + feature flags (server-side read; reliable vs browser RLS). */
export async function GET() {
  // Role unused — skip resolveOrgRoleForUserClient RTT (Tokyo).
  const auth = await requireSessionClientIdLite()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.ctx.admin
    .from('clients')
    .select('sidebar_nav_order, sidebar_nav_labels, enabled_nav_features')
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const row = data as {
    sidebar_nav_order?: unknown
    sidebar_nav_labels?: unknown
    enabled_nav_features?: unknown
  } | null
  if (!row) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const palgatePilot = await isPalGateAccessAllowed(auth.ctx.admin, auth.ctx.clientId)
  const parsedOrder = parseSidebarNavOrderFromDb(row.sidebar_nav_order)

  return NextResponse.json({
    sidebar_nav_order: withParkingPilotOrder(parsedOrder, palgatePilot),
    sidebar_nav_labels: parseSidebarNavLabelsFromDb(row.sidebar_nav_labels),
    enabled_nav_features: parseEnabledNavFeaturesFromDb(row.enabled_nav_features),
    palgate_pilot: palgatePilot,
  })
}
