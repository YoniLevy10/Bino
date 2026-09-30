/**
 * lib/api-auth.ts — אימות API routes דשבורד
 *
 * @description
 * כל API route של הדשבורד קורא ל-requireSessionClientId() בתחילה.
 * הפונקציה מחזירה: { ok, ctx: { userId, clientId, admin, role } }
 * אם אין session חוקי → { ok: false, response: 401/403/500 }
 *
 * Audit #04: mutating routes must use requireSessionWriteAccess() so viewers
 * cannot write via API even if the UI hides buttons.
 */
import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSingletonClientId } from '@/lib/singleton-client-server'
import { canOrgRoleWrite, isOrgUserRole, type OrgUserRole } from '@/lib/org-role'
import { resolveOrgRoleForUserClient } from '@/lib/org-role-resolve'

export type SessionClientContext = {
  userId: string
  clientId: string
  admin: SupabaseClient
  role: OrgUserRole
}

/**
 * משתמש מחובר + service role + client_id לפי organization chain + role.
 */
export async function requireSessionClientId(): Promise<
  { ok: true; ctx: SessionClientContext } | { ok: false; response: NextResponse }
> {
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser()
  if (uErr || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 }),
    }
  }

  let admin: SupabaseClient
  try {
    admin = getSupabaseAdmin()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 }),
    }
  }

  try {
    const clientId = await getSingletonClientId(admin, user.id)
    const roleRaw = await resolveOrgRoleForUserClient(admin, user.id, clientId)
    const role: OrgUserRole = isOrgUserRole(roleRaw) ? roleRaw : 'viewer'
    return { ok: true, ctx: { userId: user.id, clientId, admin, role } }
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'יש להשלים אונבורדינג או שיוך ארגון' },
        { status: 403 }
      ),
    }
  }
}

/** Session + write role (admin/manager). Rejects viewer. */
export async function requireSessionWriteAccess(): Promise<
  { ok: true; ctx: SessionClientContext } | { ok: false; response: NextResponse }
> {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth
  if (!canOrgRoleWrite(auth.ctx.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'אין הרשאת כתיבה לתפקיד צופה', code: 'VIEWER_READ_ONLY' },
        { status: 403 }
      ),
    }
  }
  return auth
}
