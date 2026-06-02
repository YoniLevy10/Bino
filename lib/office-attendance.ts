import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type OfficeStaffRow = {
  id: string
  client_id: string
  full_name: string
  hourly_rate: number | null
  is_active: boolean
}

export type OfficeClockGeo = {
  lat: number
  lng: number
  accuracy_m?: number | null
}

export async function resolveClientByStationToken(stationToken: string) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('clients')
    .select('id, name, office_attendance_station_token')
    .eq('office_attendance_station_token', stationToken)
    .maybeSingle()

  if (error) throw error
  if (!data?.id) return null
  return { clientId: data.id as string, clientName: (data.name as string) || 'המשרד' }
}

export async function listActiveOfficeStaff(clientId: string) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('office_staff')
    .select('id, full_name, is_active')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('full_name')

  if (error) throw error
  return (data || []) as { id: string; full_name: string; is_active: boolean }[]
}

export async function openShiftByStaffIds(staffIds: string[]) {
  if (staffIds.length === 0) return new Set<string>()
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('office_time_entries')
    .select('staff_id')
    .in('staff_id', staffIds)
    .is('clock_out_at', null)

  if (error) throw error
  return new Set((data || []).map((r) => r.staff_id as string))
}

export async function toggleOfficeClock(params: {
  clientId: string
  staffId: string
  geo: OfficeClockGeo | null
}) {
  const admin = getSupabaseAdmin()
  const { data: staff, error: staffErr } = await admin
    .from('office_staff')
    .select('id, full_name')
    .eq('id', params.staffId)
    .eq('client_id', params.clientId)
    .eq('is_active', true)
    .maybeSingle()

  if (staffErr) throw staffErr
  if (!staff) return { ok: false as const, error: 'עובדת לא נמצאה' }

  const { data: open, error: openErr } = await admin
    .from('office_time_entries')
    .select('id, clock_in_at')
    .eq('staff_id', params.staffId)
    .eq('client_id', params.clientId)
    .is('clock_out_at', null)
    .maybeSingle()

  if (openErr) throw openErr

  const now = new Date().toISOString()

  if (open?.id) {
    const { error: updErr } = await admin
      .from('office_time_entries')
      .update({
        clock_out_at: now,
        clock_out_lat: params.geo?.lat ?? null,
        clock_out_lng: params.geo?.lng ?? null,
        clock_out_accuracy_m: params.geo?.accuracy_m ?? null,
      })
      .eq('id', open.id)

    if (updErr) throw updErr
    return {
      ok: true as const,
      action: 'out' as const,
      staffName: staff.full_name as string,
      at: now,
      clockInAt: open.clock_in_at as string,
    }
  }

  const { error: insErr } = await admin.from('office_time_entries').insert({
    client_id: params.clientId,
    staff_id: params.staffId,
    clock_in_at: now,
    clock_in_lat: params.geo?.lat ?? null,
    clock_in_lng: params.geo?.lng ?? null,
    clock_in_accuracy_m: params.geo?.accuracy_m ?? null,
  })

  if (insErr) throw insErr
  return {
    ok: true as const,
    action: 'in' as const,
    staffName: staff.full_name as string,
    at: now,
  }
}

export function formatOfficeClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

export function formatOfficeHoursBetween(clockIn: string, clockOut: string): string {
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  if (ms <= 0) return '0:00'
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
