/**
 * Auth helpers for Levy Marketing Brain routes.
 * Independent of Bamakor requireSessionClientId() — uses mbrain_* membership.
 */
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { MbrainMemberRole } from '@/lib/mbrain/types'

export type MbrainSessionContext = {
  userId: string
  organizationId: string
  role: MbrainMemberRole
  admin: SupabaseClient
}

const WRITE_ROLES: MbrainMemberRole[] = ['owner', 'admin']

export async function requireMbrainSession(): Promise<
  { ok: true; ctx: MbrainSessionContext } | { ok: false; response: NextResponse }
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

  const { data: membership, error } = await admin
    .from('mbrain_organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'שגיאת הרשאות' }, { status: 500 }),
    }
  }

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'אין שיוך לארגון Marketing Brain',
          code: 'MBRAIN_NO_MEMBERSHIP',
        },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      organizationId: membership.organization_id as string,
      role: membership.role as MbrainMemberRole,
      admin,
    },
  }
}

export function requireMbrainWriteRole(
  ctx: MbrainSessionContext
): NextResponse | null {
  if (!WRITE_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'אין הרשאת כתיבה' }, { status: 403 })
  }
  return null
}

export async function assertBrandInOrg(
  admin: SupabaseClient,
  organizationId: string,
  brandId: string
): Promise<boolean> {
  const { data } = await admin
    .from('mbrain_brands')
    .select('id')
    .eq('id', brandId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  return Boolean(data)
}
