import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  getMembershipForUser,
  listActiveMembershipsForUser,
} from '@/lib/resident-portal/memberships'
import {
  RESIDENT_MEMBERSHIP_COOKIE,
  type ResidentContext,
  type ResidentPortalMembershipView,
} from '@/lib/resident-portal/types'

export type RequireResidentResult =
  | { ok: true; ctx: ResidentContext }
  | { ok: false; response: NextResponse }

function readMembershipIdHint(opts?: {
  membershipId?: string | null
  request?: Request
}): string | null {
  if (opts?.membershipId?.trim()) return opts.membershipId.trim()
  if (opts?.request) {
    const header = opts.request.headers.get('x-resident-membership-id')?.trim()
    if (header) return header
  }
  return null
}

async function readMembershipCookie(): Promise<string | null> {
  try {
    const jar = await cookies()
    return jar.get(RESIDENT_MEMBERSHIP_COOKIE)?.value?.trim() || null
  } catch {
    return null
  }
}

async function resolveMembership(
  admin: SupabaseClient,
  userId: string,
  preferredId: string | null
): Promise<ResidentPortalMembershipView | null> {
  if (preferredId) {
    const preferred = await getMembershipForUser(admin, userId, preferredId)
    if (preferred) return preferred
  }
  const list = await listActiveMembershipsForUser(admin, userId)
  if (list.length === 1) return list[0]
  if (list.length > 1 && preferredId) {
    // Preferred was invalid/revoked — do not silently pick another when client asked for one.
    return null
  }
  if (list.length > 1) {
    const cookieId = await readMembershipCookie()
    if (cookieId) {
      const fromCookie = list.find((m) => m.id === cookieId)
      if (fromCookie) return fromCookie
    }
    // Multi-membership without selection — caller should prompt picker.
    return null
  }
  return list[0] ?? null
}

/**
 * Auth user + active portal membership. Browser ids are hints only.
 * service_role admin client is returned for scoped queries (must still filter by membership).
 */
export async function requireResidentContext(opts?: {
  membershipId?: string | null
  request?: Request
  /** When true, multi-membership without selection returns 409 instead of 403. */
  allowPicker?: boolean
}): Promise<RequireResidentResult> {
  let supabase
  try {
    supabase = await createSupabaseRouteHandlerClient()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 }),
    }
  }

  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser()
  if (uErr || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'נדרשת התחברות לפורטל הדיירים' }, { status: 401 }),
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

  const hint = readMembershipIdHint(opts) ?? (await readMembershipCookie())
  let membership: ResidentPortalMembershipView | null
  try {
    membership = await resolveMembership(admin, user.id, hint)
  } catch (e) {
    console.error('[requireResidentContext]', e)
    return {
      ok: false,
      response: NextResponse.json({ error: 'שגיאת שרת בטעינת הרשאות' }, { status: 500 }),
    }
  }

  if (!membership) {
    const all = await listActiveMembershipsForUser(admin, user.id).catch(() => [])
    if (all.length > 1 && (opts?.allowPicker || !hint)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'יש לבחור דירה פעילה',
            code: 'MEMBERSHIP_PICKER_REQUIRED',
            memberships: all.map((m) => ({
              id: m.id,
              project_name: m.project_name,
              apartment_number: m.apartment_number,
              client_name: m.client_name,
            })),
          },
          { status: 409 }
        ),
      }
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'אין חברות פעילה בפורטל הדיירים', code: 'NO_RESIDENT_MEMBERSHIP' },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true,
    ctx: { userId: user.id, membership, admin },
  }
}

/** Assert browser-supplied ids match the resolved membership (never trust alone). */
export function assertMembershipScope(
  membership: ResidentPortalMembershipView,
  claimed: {
    client_id?: string | null
    project_id?: string | null
    unit_id?: string | null
    resident_id?: string | null
  }
): { ok: true } | { ok: false; error: string } {
  if (claimed.client_id && claimed.client_id !== membership.client_id) {
    return { ok: false, error: 'מזהה לקוח אינו מורשה' }
  }
  if (claimed.project_id && claimed.project_id !== membership.project_id) {
    return { ok: false, error: 'מזהה פרויקט אינו מורשה' }
  }
  if (claimed.resident_id && claimed.resident_id !== membership.resident_id) {
    return { ok: false, error: 'מזהה דייר אינו מורשה' }
  }
  if (claimed.unit_id && membership.unit_id && claimed.unit_id !== membership.unit_id) {
    return { ok: false, error: 'מזהה דירה אינו מורשה' }
  }
  return { ok: true }
}
