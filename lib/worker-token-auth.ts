import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type WorkerTokenRow = {
  id: string
  client_id: string
  full_name: string
  can_mark_professional_escort?: boolean
}

export async function resolveWorkerFromToken(token: string | null): Promise<WorkerTokenRow | null> {
  if (!token) return null
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('workers')
    .select('id, client_id, full_name, is_active, can_mark_professional_escort')
    .eq('access_token', token)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data || !data.is_active) return null
  return data as WorkerTokenRow
}

export async function verifyWorkerOwnsTicket(
  admin: SupabaseClient,
  ticketId: string,
  workerId: string,
  clientId: string
): Promise<boolean> {
  const { data } = await admin
    .from('tickets')
    .select('id')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .eq('assigned_worker_id', workerId)
    .is('deleted_at', null)
    .maybeSingle()
  return !!data
}
