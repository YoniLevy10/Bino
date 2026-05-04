import type { SupabaseClient } from '@supabase/supabase-js'

export type ResidentRow = {
  id: string
  project_id: string
  phone: string | null
  client_id: string | null
  full_name: string
  apartment_number?: string | null
}

/** Lookup by WhatsApp-normalized DB phone key (`whatsappDbPhoneKey`) + tenant.
 * Handles both formats: '972...' and '+972...' since residents may be imported with either. */
export async function findResidentByPhoneClient(
  supabase: SupabaseClient,
  clientId: string,
  dbPhone: string
): Promise<ResidentRow | null> {
  const digits = dbPhone.replace(/^\+/, '')
  const withPlus = `+${digits}`

  const { data, error } = await supabase
    .from('residents')
    .select('id, project_id, phone, client_id, full_name, apartment_number')
    .eq('client_id', clientId)
    .in('phone', [digits, withPlus])
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null
  return data as ResidentRow
}

/**
 * Resident memory for WhatsApp: return existing row or insert minimal resident after building is known.
 */
export async function getOrCreateResident(
  supabase: SupabaseClient,
  clientId: string,
  dbPhone: string,
  projectId: string
): Promise<ResidentRow | null> {
  const existing = await findResidentByPhoneClient(supabase, clientId, dbPhone)
  if (existing) {
    if (existing.project_id !== projectId) {
      await supabase
        .from('residents')
        .update({ project_id: projectId, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .is('deleted_at', null)
    }
    return { ...existing, project_id: projectId }
  }

  const { data: created, error } = await supabase
    .from('residents')
    .insert({
      client_id: clientId,
      project_id: projectId,
      phone: dbPhone,
      full_name: 'דייר WhatsApp',
    })
    .select('id, project_id, phone, client_id, full_name, apartment_number')
    .single()

  if (error || !created) {
    console.error('⚠️ getOrCreateResident insert failed:', error)
    return null
  }
  return created as ResidentRow
}
