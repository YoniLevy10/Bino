import { NextResponse } from 'next/server'
import { requireSessionClientId, requireSessionMinRole } from '@/lib/api-auth'
import { assertClientNavFeatureEnabled } from '@/lib/client-nav-features'
import type { OrgUserRole } from '@/lib/org-roles'
import type { SidebarNavItemId } from '@/lib/sidebar-nav'

export async function requireSessionClientIdWithNavFeature(
  featureId: SidebarNavItemId,
  minRole?: OrgUserRole
) {
  const auth = minRole ? await requireSessionMinRole(minRole) : await requireSessionClientId()
  if (!auth.ok) return auth

  const blocked = await assertClientNavFeatureEnabled(
    auth.ctx.admin,
    auth.ctx.clientId,
    featureId
  )
  if (blocked) {
    return { ok: false as const, response: blocked }
  }

  return auth
}

export function featureDisabledResponse(): NextResponse {
  return NextResponse.json(
    { error: "פיצ'ר בתשלום. ליצירת קשר: הנהלת Levy Tech." },
    { status: 403 }
  )
}
