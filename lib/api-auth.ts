/**
 * lib/api-auth.ts — אימות API routes דשבורד
 *
 * @description
 * כל API route של הדשבורד קורא ל-requireSessionClientId() בתחילה.
 * הפונקציה מחזירה: { ok, ctx: { userId, clientId, admin, role } }
 * אם אין session חוקי → { ok: false, response: 401/403/500 }
 */
import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSingletonClientId } from '@/lib/singleton-client-server'
import {
  forbiddenRoleResponse,
  resolveOrgRoleForUser,
  roleAtLeast,
  type OrgUserRole,
} from '@/lib/org-roles'

export type SessionClientContext = {
  userId: string
  clientId: string
  admin: SupabaseClient
  role: OrgUserRole
}

/**
 * משתמש מחובר + service role + client_id לפי organization chain + org role.
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
    const resolved = await resolveOrgRoleForUser(admin, user.id, clientId)
    // Dev BAMAKOR_CLIENT_ID fallback / missing row → admin (historical default).
    const role: OrgUserRole = resolved ?? 'admin'
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

/** Session + tenant + minimum org role (viewer < manager < admin). */
export async function requireSessionMinRole(
  minRole: OrgUserRole
): Promise<{ ok: true; ctx: SessionClientContext } | { ok: false; response: NextResponse }> {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth
  if (!roleAtLeast(auth.ctx.role, minRole)) {
    return { ok: false, response: forbiddenRoleResponse() }
  }
  return auth
}
