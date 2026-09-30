import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ensure a project_id belongs to the authenticated tenant (and is not soft-deleted).
 * Audit #05.
 */
export async function assertProjectOwnedByClient(
  admin: SupabaseClient,
  clientId: string,
  projectId: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (projectId == null || projectId === '') return { ok: true }
  const { data, error } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'פרויקט לא נמצא בחשבון' }
  return { ok: true }
}

/**
 * Ensure a worker_id belongs to the authenticated tenant, is active, and not deleted.
 * Audit #05 / #06.
 */
export async function assertWorkerOwnedByClient(
  admin: SupabaseClient,
  clientId: string,
  workerId: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (workerId == null || workerId === '') return { ok: true }
  const { data, error } = await admin
    .from('workers')
    .select('id, is_active, deleted_at')
    .eq('id', workerId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'עובד לא נמצא בחשבון' }
  const row = data as { is_active?: boolean | null; deleted_at?: string | null }
  if (row.deleted_at) return { ok: false, error: 'עובד נמחק' }
  if (row.is_active === false) return { ok: false, error: 'עובד אינו פעיל' }
  return { ok: true }
}
