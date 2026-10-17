/**
 * lib/api-auth.ts — אימות API routes דשבורד
 *
 * @description
 * כל API route של הדשבורד קורא ל-requireSessionClientId() / Lite בתחילה.
 * הפונקציה מחזירה: { ok, ctx: { userId, clientId, admin, role? } }
 * אם אין session חוקי → { ok: false, response: 401/403/500 }
 *
 * Audit #04: mutating routes must use requireSessionWriteAccess() so viewers
 * cannot write via API even if the UI hides buttons.
 *
 * Perf: hot read routes that do not need org role should use
 * requireSessionClientIdLite() to skip resolveOrgRoleForUserClient
 * (one less Frankfurt↔Tokyo PostgREST round trip).
 */
import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSingletonClientId } from '@/lib/singleton-client-server'
import { canOrgRoleWrite, isOrgUserRole, type OrgUserRole } from '@/lib/org-role'
import { resolveOrgRoleForUserClient } from '@/lib/org-role-resolve'

/** Session + tenant without org role (skips role resolve RTT). */
export type SessionClientContextLite = {
  userId: string
  clientId: string
  admin: SupabaseClient
}

export type SessionClientContext = SessionClientContextLite & {
  role: OrgUserRole
}

/**
 * Authenticated user + service-role admin + singleton client_id.
 * Does **not** resolve org role — use for read routes that only need tenant scope.
 */
export async function requireSessionClientIdLite(): Promise<
  { ok: true; ctx: SessionClientContextLite } | { ok: false; response: NextResponse }
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
    return { ok: true, ctx: { userId: user.id, clientId, admin } }
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

/**
 * משתמש מחובר + service role + client_id לפי organization chain + role.
 */
export async function requireSessionClientId(): Promise<
  { ok: true; ctx: SessionClientContext } | { ok: false; response: NextResponse }
> {
  const lite = await requireSessionClientIdLite()
  if (!lite.ok) return lite

  try {
    const roleRaw = await resolveOrgRoleForUserClient(
      lite.ctx.admin,
      lite.ctx.userId,
      lite.ctx.clientId
    )
    const role: OrgUserRole = isOrgUserRole(roleRaw) ? roleRaw : 'viewer'
    return { ok: true, ctx: { ...lite.ctx, role } }
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
