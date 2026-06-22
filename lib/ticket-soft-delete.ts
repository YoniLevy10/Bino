import type { SupabaseClient } from '@supabase/supabase-js'

type SoftDeleteResult = { deleted_count: number; ticket_ids: string[]; error?: string }

/** Soft-delete tenant tickets and clear related session / merge pointers. */
export async function softDeleteTicketsForClient(
  admin: SupabaseClient,
  clientId: string,
  options: { ticketIds?: string[]; deleteAll?: boolean }
): Promise<SoftDeleteResult> {
  let ids: string[] = []

  if (options.deleteAll) {
    const { data, error } = await admin
      .from('tickets')
      .select('id')
      .eq('client_id', clientId)
      .is('deleted_at', null)
    if (error) return { deleted_count: 0, ticket_ids: [], error: error.message }
    ids = ((data as { id: string }[] | null) ?? []).map((r) => r.id)
  } else {
    const requested = [...new Set((options.ticketIds ?? []).filter(Boolean))]
    if (requested.length === 0) return { deleted_count: 0, ticket_ids: [] }

    const { data, error } = await admin
      .from('tickets')
      .select('id')
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .in('id', requested)
    if (error) return { deleted_count: 0, ticket_ids: [], error: error.message }
    ids = ((data as { id: string }[] | null) ?? []).map((r) => r.id)
  }

  if (ids.length === 0) return { deleted_count: 0, ticket_ids: [] }

  const { error: mergeErr } = await admin
    .from('tickets')
    .update({ merged_into_ticket_id: null })
    .in('merged_into_ticket_id', ids)
  if (mergeErr) return { deleted_count: 0, ticket_ids: [], error: mergeErr.message }

  const { error: sessErr } = await admin
    .from('sessions')
    .update({
      active_ticket_id: null,
      is_active: false,
      pending_whatsapp_media_id: null,
      pending_whatsapp_media_type: null,
      pending_apartment_detail: null,
    })
    .in('active_ticket_id', ids)
    .eq('client_id', clientId)
  if (sessErr) return { deleted_count: 0, ticket_ids: [], error: sessErr.message }

  const { error: pendingErr } = await admin
    .from('pending_resident_join_requests')
    .update({ ticket_id: null })
    .in('ticket_id', ids)
    .eq('client_id', clientId)
  if (pendingErr) {
    // Column/table may be absent on older DBs — non-blocking
    const msg = pendingErr.message || ''
    if (!msg.includes('pending_resident_join_requests') && pendingErr.code !== '42P01') {
      return { deleted_count: 0, ticket_ids: [], error: pendingErr.message }
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error: updErr } = await admin
    .from('tickets')
    .update({ deleted_at: now, updated_at: now })
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .in('id', ids)
    .select('id')

  if (updErr) return { deleted_count: 0, ticket_ids: [], error: updErr.message }

  const deletedIds = ((updated as { id: string }[] | null) ?? []).map((r) => r.id)
  return { deleted_count: deletedIds.length, ticket_ids: deletedIds }
}
