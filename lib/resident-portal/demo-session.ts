import type { SupabaseClient } from '@supabase/supabase-js'
import { isResidentPortalDevUnlocked } from '@/lib/resident-portal/dev-unlock'
import { issueResidentPortalLoginSession } from '@/lib/resident-portal/phone-otp'
import { normalizePhone } from '@/lib/residents-whatsapp'

const DEMO_NAME_PATTERN = '%DEMO%'
const PREFERRED_DEMO_PHONE = '0500000101'

export type DemoLoginResult =
  | {
      ok: true
      email: string
      tokenHash: string
      membershipId: string
      projectId: string
      projectName: string | null
      residentName: string | null
      phone: string
    }
  | { ok: false; error: string; status: number }

/**
 * One-click QA login for a tagged DEMO resident (no SMS).
 * Gated by isResidentPortalDevUnlocked() — never production.
 */
export async function issueDemoResidentLoginSession(
  admin: SupabaseClient
): Promise<DemoLoginResult> {
  if (!isResidentPortalDevUnlocked()) {
    return { ok: false, error: 'כניסת QA אינה פעילה בשרת זה', status: 403 }
  }

  const project = await resolveDemoProject(admin)
  if (!project) {
    return {
      ok: false,
      error: 'לא נמצא פרויקט DEMO לפורטל הדיירים',
      status: 404,
    }
  }

  if (!project.resident_portal_enabled) {
    const { error: enErr } = await admin
      .from('projects')
      .update({ resident_portal_enabled: true })
      .eq('id', project.id)
    if (enErr) {
      return { ok: false, error: enErr.message, status: 500 }
    }
    project.resident_portal_enabled = true
  }

  const resident = await resolveDemoResident(admin, project.id)
  if (!resident) {
    return {
      ok: false,
      error: 'לא נמצא דייר DEMO בפרויקט QA',
      status: 404,
    }
  }

  const normalized =
    (resident.normalized_phone && normalizePhone(resident.normalized_phone)) ||
    (resident.phone && normalizePhone(resident.phone)) ||
    normalizePhone(PREFERRED_DEMO_PHONE)

  if (!normalized) {
    return { ok: false, error: 'טלפון DEMO לא תקין', status: 500 }
  }

  const issued = await issueResidentPortalLoginSession(admin, {
    resident: {
      id: resident.id,
      unit_id: resident.unit_id,
      is_renter: resident.is_renter,
      client_id: resident.client_id,
      project_id: resident.project_id,
      full_name: resident.full_name,
    },
    normalizedPhone: normalized,
    auditAction: 'portal_demo_login',
  })

  if (!issued.ok) return issued

  return {
    ok: true,
    email: issued.email,
    tokenHash: issued.tokenHash,
    membershipId: issued.membershipId,
    projectId: project.id,
    projectName: project.name,
    residentName: resident.full_name,
    phone: resident.phone || PREFERRED_DEMO_PHONE,
  }
}

async function resolveDemoProject(admin: SupabaseClient): Promise<{
  id: string
  name: string | null
  resident_portal_enabled: boolean
  client_id: string
} | null> {
  const { data: byCode } = await admin
    .from('projects')
    .select('id, name, resident_portal_enabled, client_id')
    .eq('project_code', 'DEMO_QA_HUB')
    .limit(1)
    .maybeSingle()
  if (byCode) return byCode

  const { data: byName } = await admin
    .from('projects')
    .select('id, name, resident_portal_enabled, client_id')
    .ilike('name', '%[DEMO]%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return byName ?? null
}

async function resolveDemoResident(
  admin: SupabaseClient,
  projectId: string
): Promise<{
  id: string
  full_name: string | null
  phone: string | null
  normalized_phone: string | null
  unit_id: string | null
  is_renter: boolean | null
  client_id: string
  project_id: string
} | null> {
  const preferredNorm = normalizePhone(PREFERRED_DEMO_PHONE)
  if (preferredNorm) {
    const { data: byPhone } = await admin
      .from('residents')
      .select(
        'id, full_name, phone, normalized_phone, unit_id, is_renter, client_id, project_id'
      )
      .eq('project_id', projectId)
      .eq('normalized_phone', preferredNorm)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (byPhone) return byPhone
  }

  const { data: byName } = await admin
    .from('residents')
    .select(
      'id, full_name, phone, normalized_phone, unit_id, is_renter, client_id, project_id'
    )
    .eq('project_id', projectId)
    .ilike('full_name', DEMO_NAME_PATTERN)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return byName ?? null
}
