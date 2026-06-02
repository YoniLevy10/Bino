import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Hard-delete tenant: org users, organizations, then client (CASCADE to most child tables).
 */
export async function deleteClientCompletely(
  admin: SupabaseClient,
  clientId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: orgs, error: orgListErr } = await admin
    .from('organizations')
    .select('id')
    .eq('client_id', clientId)

  if (orgListErr) return { ok: false, error: orgListErr.message }

  for (const org of orgs ?? []) {
    const { error: ouErr } = await admin.from('organization_users').delete().eq('organization_id', org.id)
    if (ouErr) return { ok: false, error: ouErr.message }
  }

  const { error: orgDelErr } = await admin.from('organizations').delete().eq('client_id', clientId)
  if (orgDelErr) return { ok: false, error: orgDelErr.message }

  const { error: clientErr } = await admin.from('clients').delete().eq('id', clientId)
  if (clientErr) return { ok: false, error: clientErr.message }

  return { ok: true }
}
