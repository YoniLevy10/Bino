import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  isAal2,
  isSuperadminIdentity,
  type SuperadminAal,
} from '@/lib/superadmin-identity'

export type SuperAdminContext = {
  userId: string
  email: string | null
  user: User
  /** Service-role client for platform ops (bypasses RLS). */
  admin: SupabaseClient
  aal: SuperadminAal
}

export type SuperAdminAuthResult =
  | { ok: true; ctx: SuperAdminContext }
  | { ok: false; response: NextResponse }

/**
 * Superadmin API guard: Supabase Auth session + allowlisted identity + MFA AAL2.
 * Intentionally rejects x-admin-secret / ADMIN_SETUP_SECRET — that bypass is removed.
 */
export async function requireSuperAdmin(): Promise<SuperAdminAuthResult> {
  let supabase: SupabaseClient
  try {
    supabase = await createSupabaseRouteHandlerClient()
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'שגיאת תצורת שרת', code: 'SUPERADMIN_CONFIG' },
        { status: 500 },
      ),
    }
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'נדרשת התחברות', code: 'SUPERADMIN_AUTH_REQUIRED' },
        { status: 401 },
      ),
    }
  }

  if (!isSuperadminIdentity(user)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'אין הרשאת סופר־אדמין', code: 'SUPERADMIN_FORBIDDEN' },
        { status: 403 },
      ),
    }
  }

  const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const currentLevel = (aalData?.currentLevel ?? null) as SuperadminAal

  if (aalError || !isAal2(currentLevel)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'נדרש MFA (AAL2)',
          code: 'SUPERADMIN_MFA_REQUIRED',
          currentLevel: currentLevel ?? 'aal1',
          nextLevel: aalData?.nextLevel ?? 'aal2',
        },
        { status: 401 },
      ),
    }
  }

  let admin: SupabaseClient
  try {
    admin = getSupabaseAdmin()
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'שגיאת תצורת שרת', code: 'SUPERADMIN_CONFIG' },
        { status: 500 },
      ),
    }
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      email: user.email ?? null,
      user,
      admin,
      aal: currentLevel,
    },
  }
}

/** @deprecated Prefer requireSuperAdmin(). */
export async function isSuperAdminAuthorized(_req?: Request): Promise<boolean> {
  const result = await requireSuperAdmin()
  return result.ok
}

/** @deprecated Prefer requireSuperAdmin(). */
export async function isSuperAdminRequest(_req?: Request): Promise<boolean> {
  return isSuperAdminAuthorized(_req)
}

export function superAdminUnauthorizedResponse(
  body?: { error?: string; code?: string },
): NextResponse {
  return NextResponse.json(
    {
      error: body?.error ?? 'Unauthorized',
      code: body?.code ?? 'SUPERADMIN_UNAUTHORIZED',
    },
    { status: 401 },
  )
}
