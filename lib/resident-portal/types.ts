export type ResidentPortalRole = 'owner' | 'renter' | 'other'
export type ResidentPortalMembershipStatus = 'pending' | 'active' | 'revoked'
export type TicketScope = 'common' | 'private' | 'unclear'

export type ResidentPortalMembershipRow = {
  id: string
  user_id: string
  resident_id: string
  unit_id: string | null
  client_id: string
  project_id: string
  role: ResidentPortalRole
  status: ResidentPortalMembershipStatus
  valid_from: string
  valid_to: string | null
  created_at: string
  updated_at: string
  revoked_at: string | null
}

export type ResidentPortalMembershipView = ResidentPortalMembershipRow & {
  resident_name: string | null
  apartment_number: string | null
  project_name: string | null
  project_city: string | null
  client_name: string | null
  client_logo_url: string | null
  portal_enabled: boolean
}

export type ResidentContext = {
  userId: string
  membership: ResidentPortalMembershipView
  admin: import('@supabase/supabase-js').SupabaseClient
}

export const RESIDENT_MEMBERSHIP_COOKIE = 'bino_resident_membership_v1'
export const RESIDENT_MEMBERSHIP_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30
