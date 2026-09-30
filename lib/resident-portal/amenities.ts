import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResidentPortalMembershipView } from '@/lib/resident-portal/types'
import { jerusalemTodayParts } from '@/lib/resident-portal/jerusalem-time'

export type AmenityTodayHours = {
  id: string
  name: string
  description: string | null
  guidelines: string | null
  today: {
    date: string
    is_closed: boolean
    opens_at: string | null
    closes_at: string | null
    note: string | null
    source: 'exception' | 'weekly' | 'none'
  }
}

function timeToHm(t: string | null | undefined): string | null {
  if (!t) return null
  // Postgres time may be "HH:MM:SS"
  return t.slice(0, 5)
}

export async function listAmenitiesForMembership(
  admin: SupabaseClient,
  membership: ResidentPortalMembershipView
): Promise<AmenityTodayHours[]> {
  const { dateStr, dayOfWeek } = jerusalemTodayParts()

  const { data, error } = await admin
    .from('project_amenities')
    .select(
      `
      id, name, description, guidelines, is_active, sort_order,
      project_amenity_hours ( day_of_week, opens_at, closes_at, is_closed ),
      project_amenity_exceptions ( exception_date, opens_at, closes_at, is_closed, note )
    `
    )
    .eq('client_id', membership.client_id)
    .eq('project_id', membership.project_id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(`amenities list failed: ${error.message}`)
  }

  type Hour = {
    day_of_week: number
    opens_at: string | null
    closes_at: string | null
    is_closed: boolean
  }
  type Exc = {
    exception_date: string
    opens_at: string | null
    closes_at: string | null
    is_closed: boolean
    note: string | null
  }
  type Row = {
    id: string
    name: string
    description: string | null
    guidelines: string | null
    project_amenity_hours?: Hour[] | null
    project_amenity_exceptions?: Exc[] | null
  }

  return ((data ?? []) as unknown as Row[]).map((a) => {
    const exc = (a.project_amenity_exceptions ?? []).find((e) => e.exception_date === dateStr)
    if (exc) {
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        guidelines: a.guidelines,
        today: {
          date: dateStr,
          is_closed: exc.is_closed,
          opens_at: timeToHm(exc.opens_at),
          closes_at: timeToHm(exc.closes_at),
          note: exc.note,
          source: 'exception' as const,
        },
      }
    }
    const weekly = (a.project_amenity_hours ?? []).find((h) => h.day_of_week === dayOfWeek)
    if (weekly) {
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        guidelines: a.guidelines,
        today: {
          date: dateStr,
          is_closed: weekly.is_closed,
          opens_at: timeToHm(weekly.opens_at),
          closes_at: timeToHm(weekly.closes_at),
          note: null,
          source: 'weekly' as const,
        },
      }
    }
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      guidelines: a.guidelines,
      today: {
        date: dateStr,
        is_closed: false,
        opens_at: null,
        closes_at: null,
        note: null,
        source: 'none' as const,
      },
    }
  })
}
