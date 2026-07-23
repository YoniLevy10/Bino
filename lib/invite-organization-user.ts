import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrgUserRole } from '@/lib/org-roles'

export type { OrgUserRole }

export async function inviteUserToClientOrganization(
  admin: SupabaseClient,
  opts: {
    clientId: string
    email: string
    role: OrgUserRole
    appUrl: string
  }
): Promise<{ ok: true; userId: string; email: string; role: OrgUserRole } | { ok: false; error: string }> {
  const email = opts.email.trim().toLowerCase()
  if (!email) return { ok: false, error: 'Missing email' }

  const { data: orgRows, error: orgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('client_id', opts.clientId)
    .limit(1)

  if (orgErr || !orgRows?.length) {
    return { ok: false, error: 'Organization not found for client' }
  }

  const orgId = orgRows[0].id as string

  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${opts.appUrl.replace(/\/$/, '')}/auth/callback`,
    data: { client_id: opts.clientId, organization_id: orgId },
  })

  let userId = inviteData?.user?.id ?? null

  if (inviteErr && !/already (been )?registered/i.test(inviteErr.message ?? '')) {
    return { ok: false, error: inviteErr.message }
  }

  if (!userId) {
    const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) return { ok: false, error: listErr.message }
    userId =
      listData.users.find((u) => u.email?.trim().toLowerCase() === email)?.id ?? null
  }

  if (!userId) {
    return { ok: false, error: 'User not found after invite' }
  }

  const { error: ouErr } = await admin.from('organization_users').upsert(
    { organization_id: orgId, user_id: userId, role: opts.role },
    { onConflict: 'organization_id,user_id' }
  )

  if (ouErr) {
    return { ok: false, error: ouErr.message }
  }

  return { ok: true, userId, email, role: opts.role }
}
