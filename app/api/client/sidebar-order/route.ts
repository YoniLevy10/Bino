import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import {
  parseSidebarNavOrderFromDb,
  sidebarNavOrderSchema,
  type SidebarNavItemId,
} from '@/lib/sidebar-nav'
import { isPalGateAccessAllowed } from '@/lib/palgate/access'

const bodySchema = z.object({
  order: sidebarNavOrderSchema,
})

/** Persist full sidebar order for the tenant (`clients.sidebar_nav_order`). */
export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response
  const { clientId, userId } = auth.ctx

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, userId, 'client-sidebar-order')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const rawBody = await req.json().catch(() => null)
  const validated = bodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: 'סדר תפריט לא תקין' }, { status: 400 })
  }

  let nextOrder = [...validated.data.order] as SidebarNavItemId[]
  if (!(await isPalGateAccessAllowed(admin, clientId))) {
    nextOrder = nextOrder.filter((id) => id !== 'parking')
  }

  const { data: row, error: readErr } = await admin
    .from('clients')
    .select('sidebar_nav_order')
    .eq('id', clientId)
    .maybeSingle()

  if (readErr || !row) {
    return NextResponse.json({ error: 'לקוח לא נמצא' }, { status: 404 })
  }

  // Keep any ids that exist in DB but were omitted from the visible list (locked/hidden).
  const existing = parseSidebarNavOrderFromDb(
    (row as { sidebar_nav_order?: unknown }).sidebar_nav_order
  )
  if (existing?.length) {
    const seen = new Set(nextOrder)
    for (const id of existing) {
      if (!seen.has(id)) nextOrder.push(id)
    }
  }

  const { error } = await admin
    .from('clients')
    .update({ sidebar_nav_order: nextOrder })
    .eq('id', clientId)

  if (error) {
    console.error('[client/sidebar-order]', error.message)
    return NextResponse.json({ error: 'שמירת התפריט נכשלה' }, { status: 500 })
  }

  await logAudit({
    clientId,
    userId,
    action: 'UPDATE_CLIENT_SETTINGS',
    entityType: 'client',
    entityId: clientId,
    newValues: { sidebar_nav_order: nextOrder },
  })

  return NextResponse.json({ ok: true, sidebar_nav_order: nextOrder })
}
