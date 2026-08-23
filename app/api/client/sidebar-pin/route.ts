import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { sidebarPinBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { logAudit } from '@/lib/audit'
import { getClientEnabledAddonKeys, navIdsForEnabledAddonKeys, PAID_ADDON_NAV_ID } from '@/lib/paid-addons'
import { parseEnabledNavFeaturesFromDb } from '@/lib/client-nav-features'
import {
  nextSidebarOrderAfterPinToggle,
  parseSidebarNavOrderFromDb,
  type SidebarNavItemId,
} from '@/lib/sidebar-nav'

/**
 * Pin or unpin a paid addon in the tenant sidebar (`clients.sidebar_nav_order`).
 */
export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response
  const { clientId, userId } = auth.ctx

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, userId, 'client-sidebar-pin')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const rawBody = await req.json().catch(() => null)
  const validated = sidebarPinBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const { addon_key: addonKey, pinned } = validated.data
  const navId = PAID_ADDON_NAV_ID[addonKey]

  const [enabledKeys, clientRes] = await Promise.all([
    getClientEnabledAddonKeys(admin, clientId),
    admin
      .from('clients')
      .select('sidebar_nav_order, enabled_nav_features')
      .eq('id', clientId)
      .maybeSingle(),
  ])

  if (clientRes.error || !clientRes.data) {
    return NextResponse.json({ error: 'לקוח לא נמצא' }, { status: 404 })
  }

  if (pinned && !enabledKeys.has(addonKey)) {
    return NextResponse.json({ error: 'הפעילו את התוסף כדי להוסיף אותו לתפריט' }, { status: 400 })
  }

  const row = clientRes.data as {
    sidebar_nav_order?: unknown
    enabled_nav_features?: unknown
  }
  const currentOrder = parseSidebarNavOrderFromDb(row.sidebar_nav_order)
  const enabledFeatures = parseEnabledNavFeaturesFromDb(row.enabled_nav_features)
  const paidNavIds = new Set(navIdsForEnabledAddonKeys(enabledKeys))
  const nextOrder = nextSidebarOrderAfterPinToggle(
    currentOrder,
    enabledFeatures,
    paidNavIds,
    navId,
    pinned
  )

  const update: { sidebar_nav_order: SidebarNavItemId[]; enabled_nav_features?: SidebarNavItemId[] } =
    { sidebar_nav_order: nextOrder }

  if (pinned && enabledFeatures && !enabledFeatures.includes(navId)) {
    update.enabled_nav_features = [...enabledFeatures, navId]
  }

  const { error } = await admin.from('clients').update(update).eq('id', clientId)
  if (error) {
    console.error('[client/sidebar-pin]', error.message)
    return NextResponse.json({ error: 'שמירת התפריט נכשלה' }, { status: 500 })
  }

  await logAudit({
    clientId,
    userId,
    action: 'UPDATE_CLIENT_SETTINGS',
    entityType: 'client',
    entityId: clientId,
    newValues: { sidebar_pin: { addon_key: addonKey, pinned } },
  })

  return NextResponse.json({ ok: true, sidebar_nav_order: nextOrder })
}
