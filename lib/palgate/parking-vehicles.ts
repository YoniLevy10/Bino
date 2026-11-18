import type { SupabaseClient } from '@supabase/supabase-js'

export type ParkingVehicleRow = {
  id: string
  client_id: string
  plate: string
  label: string | null
  created_at: string
  created_by: string | null
}

/** Normalize Israeli-ish plate / free-text identifier for storage + unique key. */
export function normalizeParkingPlate(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s\-_.]/g, '')
}

export async function listParkingVehicles(
  admin: SupabaseClient,
  clientId: string
): Promise<ParkingVehicleRow[]> {
  const { data, error } = await admin
    .from('parking_vehicles')
    .select('id, client_id, plate, label, created_at, created_by')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)
  return (data || []) as ParkingVehicleRow[]
}

export async function insertParkingVehicle(
  admin: SupabaseClient,
  opts: { clientId: string; plate: string; label?: string | null; userId: string | null }
): Promise<ParkingVehicleRow> {
  const plate = normalizeParkingPlate(opts.plate)
  if (plate.length < 2 || plate.length > 32) {
    throw new Error('מספר רכב / מזהה חייב להיות בין 2 ל־32 תווים')
  }
  const label = opts.label?.trim() || null

  const { data, error } = await admin
    .from('parking_vehicles')
    .insert({
      client_id: opts.clientId,
      plate,
      label,
      created_by: opts.userId,
    })
    .select('id, client_id, plate, label, created_at, created_by')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('מספר רכב זה כבר קיים')
    }
    throw new Error(error.message)
  }
  return data as ParkingVehicleRow
}

export async function deleteParkingVehicle(
  admin: SupabaseClient,
  opts: { clientId: string; vehicleId: string }
): Promise<void> {
  const existing = await getParkingVehicleForClient(admin, opts)
  if (!existing) throw new Error('רכב לא נמצא')

  const { error } = await admin
    .from('parking_vehicles')
    .delete()
    .eq('client_id', opts.clientId)
    .eq('id', opts.vehicleId)

  if (error) throw new Error(error.message)
}

export async function getParkingVehicleForClient(
  admin: SupabaseClient,
  opts: { clientId: string; vehicleId: string }
): Promise<ParkingVehicleRow | null> {
  const { data, error } = await admin
    .from('parking_vehicles')
    .select('id, client_id, plate, label, created_at, created_by')
    .eq('client_id', opts.clientId)
    .eq('id', opts.vehicleId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as ParkingVehicleRow | null) ?? null
}
