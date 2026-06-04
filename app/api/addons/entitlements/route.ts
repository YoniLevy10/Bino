import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { getClientEnabledAddonKeys, listActiveAddonsCatalog } from '@/lib/paid-addons'

/** Tenant dashboard: catalog prices + which add-ons are enabled for this client. */
export async function GET() {
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const clientId = auth.ctx.clientId

    const [catalog, enabledKeys] = await Promise.all([
      listActiveAddonsCatalog(admin),
      getClientEnabledAddonKeys(admin, clientId),
    ])

    const addons = catalog.map((row) => ({
      ...row,
      enabled: enabledKeys.has(row.addon_key),
    }))

    return NextResponse.json({ addons, enabled_keys: [...enabledKeys] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('paid_addons') || msg.includes('does not exist')) {
      return NextResponse.json({ addons: [], enabled_keys: [], catalog_missing: true })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
