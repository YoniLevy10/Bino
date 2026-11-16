import type { SupabaseClient } from '@supabase/supabase-js'

/** Ensure project belongs to the session client. */
export async function assertProjectForClient(
  admin: SupabaseClient,
  projectId: string,
  clientId: string
): Promise<{ ok: true } | { ok: false; status: 404 | 500; error: string }> {
  const { data, error } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) return { ok: false, status: 500, error: 'שגיאה בטעינת פרויקט' }
  if (!data) return { ok: false, status: 404, error: 'פרויקט לא נמצא' }
  return { ok: true }
}
