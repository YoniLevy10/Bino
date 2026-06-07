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

function normalizeStaffName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Find or create office_staff row by display name (for guest / walk-in clock). */
export async function resolveOrCreateOfficeStaffByName(clientId: string, fullName: string) {
  const trimmed = fullName.trim().replace(/\s+/g, ' ')
  if (!trimmed) return null

  const admin = getSupabaseAdmin()
  const { data: existing, error: listErr } = await admin
    .from('office_staff')
    .select('id, full_name')
    .eq('client_id', clientId)
    .eq('is_active', true)

  if (listErr) throw listErr
  const key = normalizeStaffName(trimmed)
  const match = (existing || []).find((r) => normalizeStaffName(r.full_name as string) === key)
  if (match?.id) return { id: match.id as string, full_name: match.full_name as string }

  const { data: created, error: insErr } = await admin
    .from('office_staff')
    .insert({
      client_id: clientId,
      full_name: trimmed,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select('id, full_name')
    .single()

  if (insErr) throw insErr
  return { id: created.id as string, full_name: created.full_name as string }
}

/** Copy active field workers into office_staff for QR station clock-in. */
export async function syncWorkersToOfficeStaff(clientId: string): Promise<{ added: number; total: number }> {
  const admin = getSupabaseAdmin()
  const [{ data: workers, error: wErr }, { data: staff, error: sErr }] = await Promise.all([
    admin
      .from('workers')
      .select('full_name')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .is('deleted_at', null),
    admin.from('office_staff').select('full_name').eq('client_id', clientId),
  ])

  if (wErr) throw wErr
  if (sErr) throw sErr

  const existingNames = new Set(
    (staff || []).map((r) => normalizeStaffName((r.full_name as string) || ''))
  )
  let added = 0
  const now = new Date().toISOString()

  for (const row of workers || []) {
    const name = (row.full_name as string | null)?.trim()
    if (!name) continue
    const key = normalizeStaffName(name)
    if (existingNames.has(key)) continue
    const { error } = await admin.from('office_staff').insert({
      client_id: clientId,
      full_name: name,
      is_active: true,
      updated_at: now,
    })
    if (error) throw error
    existingNames.add(key)
    added++
  }

  return { added, total: existingNames.size }
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
