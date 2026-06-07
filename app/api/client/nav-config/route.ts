import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { parseEnabledNavFeaturesFromDb } from '@/lib/client-nav-features'
import { parseSidebarNavOrderFromDb, parseSidebarNavLabelsFromDb } from '@/lib/sidebar-nav'

/** Tenant nav order + feature flags (server-side read; reliable vs browser RLS). */
export async function GET() {
  const auth = await requireSessionClientId()
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

  return NextResponse.json({
    sidebar_nav_order: parseSidebarNavOrderFromDb(row.sidebar_nav_order),
    sidebar_nav_labels: parseSidebarNavLabelsFromDb(row.sidebar_nav_labels),
    enabled_nav_features: parseEnabledNavFeaturesFromDb(row.enabled_nav_features),
  })
}
