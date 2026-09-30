import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResidentPortalMembershipView } from '@/lib/resident-portal/types'
import { isAnnouncementVisibleNow } from '@/lib/resident-portal/jerusalem-time'

export type ResidentAnnouncement = {
  id: string
  title: string
  body: string
  is_pinned: boolean
  publish_at: string | null
  published_at: string | null
  expires_at: string | null
}

function audienceAllows(
  rows: Array<{
    audience_type: string
    building_id: string | null
    unit_id: string | null
  }>,
  membership: ResidentPortalMembershipView,
  unitBuildingId: string | null
): boolean {
  if (rows.length === 0) return true // no audience rows = whole project
  return rows.some((a) => {
    if (a.audience_type === 'project') return true
    if (a.audience_type === 'unit' && membership.unit_id && a.unit_id === membership.unit_id) {
      return true
    }
    if (
      a.audience_type === 'building' &&
      unitBuildingId &&
      a.building_id === unitBuildingId
    ) {
      return true
    }
    return false
  })
}

export async function listPublishedAnnouncementsForMembership(
  admin: SupabaseClient,
  membership: ResidentPortalMembershipView
): Promise<ResidentAnnouncement[]> {
  const { data: unit } = membership.unit_id
    ? await admin
        .from('project_units')
        .select('building_id')
        .eq('id', membership.unit_id)
        .maybeSingle()
    : { data: null }
  const unitBuildingId = (unit as { building_id?: string | null } | null)?.building_id ?? null

  const { data, error } = await admin
    .from('project_announcements')
    .select(
      'id, title, body, is_pinned, publish_at, published_at, expires_at, status, project_announcement_audience(audience_type, building_id, unit_id)'
    )
    .eq('client_id', membership.client_id)
    .eq('project_id', membership.project_id)
    .eq('status', 'published')
    .order('is_pinned', { ascending: false })
    .order('publish_at', { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(`announcements list failed: ${error.message}`)
  }

  const now = new Date()
  type Row = ResidentAnnouncement & {
    status: string
    project_announcement_audience?: Array<{
      audience_type: string
      building_id: string | null
      unit_id: string | null
    }> | null
  }

  return ((data ?? []) as unknown as Row[])
    .filter((row) =>
      isAnnouncementVisibleNow({
        status: row.status,
        publish_at: row.publish_at,
        published_at: row.published_at,
        expires_at: row.expires_at,
        now,
      })
    )
    .filter((row) =>
      audienceAllows(row.project_announcement_audience ?? [], membership, unitBuildingId)
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      is_pinned: row.is_pinned,
      publish_at: row.publish_at,
      published_at: row.published_at,
      expires_at: row.expires_at,
    }))
}
