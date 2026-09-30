import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResidentPortalMembershipView } from '@/lib/resident-portal/types'

const MEMBERSHIP_SELECT = `
  id, user_id, resident_id, unit_id, client_id, project_id, role, status,
  valid_from, valid_to, created_at, updated_at, revoked_at,
  residents ( id, full_name, apartment_number ),
  projects ( id, name, city, resident_portal_enabled ),
  clients ( id, name, display_name, logo_url )
`.replace(/\s+/g, ' ').trim()

type RawMembership = {
  id: string
  user_id: string
  resident_id: string
  unit_id: string | null
  client_id: string
  project_id: string
  role: ResidentPortalMembershipView['role']
  status: ResidentPortalMembershipView['status']
  valid_from: string
  valid_to: string | null
  created_at: string
  updated_at: string
  revoked_at: string | null
  residents?: {
    id: string
    full_name: string | null
    apartment_number: string | null
  } | null
  projects?: {
    id: string
    name: string | null
    city: string | null
    resident_portal_enabled?: boolean | null
  } | null
  clients?: {
    id: string
    name: string | null
    display_name: string | null
    logo_url: string | null
  } | null
}

function mapMembership(row: RawMembership): ResidentPortalMembershipView {
  const clientName =
    row.clients?.display_name?.trim() || row.clients?.name?.trim() || null
  return {
    id: row.id,
    user_id: row.user_id,
    resident_id: row.resident_id,
    unit_id: row.unit_id,
    client_id: row.client_id,
    project_id: row.project_id,
    role: row.role,
    status: row.status,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    created_at: row.created_at,
    updated_at: row.updated_at,
    revoked_at: row.revoked_at,
    resident_name: row.residents?.full_name ?? null,
    apartment_number: row.residents?.apartment_number ?? null,
    project_name: row.projects?.name ?? null,
    project_city: row.projects?.city ?? null,
    client_name: clientName,
    client_logo_url: row.clients?.logo_url ?? null,
    portal_enabled: Boolean(row.projects?.resident_portal_enabled),
  }
}

function isMembershipCurrentlyValid(m: ResidentPortalMembershipView, now = new Date()): boolean {
  if (m.status !== 'active') return false
  if (m.revoked_at) return false
  if (m.valid_to && new Date(m.valid_to).getTime() <= now.getTime()) return false
  return true
}

export async function listActiveMembershipsForUser(
  admin: SupabaseClient,
  userId: string
): Promise<ResidentPortalMembershipView[]> {
  const { data, error } = await admin
    .from('resident_portal_memberships')
    .select(MEMBERSHIP_SELECT)
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('revoked_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`resident memberships list failed: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as RawMembership[]
  return rows.map(mapMembership).filter((m) => isMembershipCurrentlyValid(m) && m.portal_enabled)
}

export async function getMembershipForUser(
  admin: SupabaseClient,
  userId: string,
  membershipId: string
): Promise<ResidentPortalMembershipView | null> {
  const { data, error } = await admin
    .from('resident_portal_memberships')
    .select(MEMBERSHIP_SELECT)
    .eq('id', membershipId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`resident membership fetch failed: ${error.message}`)
  }
  if (!data) return null
  const mapped = mapMembership(data as unknown as RawMembership)
  if (!isMembershipCurrentlyValid(mapped) || !mapped.portal_enabled) return null
  return mapped
}

export async function userHasActiveResidentMembership(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const list = await listActiveMembershipsForUser(admin, userId)
  return list.length > 0
}
