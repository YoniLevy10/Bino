import type { SupabaseClient } from '@supabase/supabase-js'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

/** Client IDs with worker_stamp addon enabled. */
export async function listWorkerStampEnabledClientIds(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin
    .from('client_paid_addons')
    .select('client_id')
    .eq('addon_key', PAID_ADDON_KEYS.worker_stamp)
    .eq('enabled', true)

  if (error || !data?.length) return []
  return data.map((row) => (row as { client_id: string }).client_id)
}
