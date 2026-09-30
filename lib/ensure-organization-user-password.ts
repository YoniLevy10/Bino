import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrgUserRole } from '@/lib/invite-organization-user'

const MIN_PASSWORD_LENGTH = 8

export async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = data.users.find((u) => u.email?.trim().toLowerCase() === normalized)
    if (hit?.id) return hit.id
    if (data.users.length < 200) break
  }
  return null
}

/**
 * Create (or update) an Auth user with email + password, confirm the email,
 * and link them to the client's organization. Prefer this over invite links
 * when the recipient cannot complete magic-link email flows.
 */
export async function ensureOrganizationUserWithPassword(
  admin: SupabaseClient,
  opts: {
    clientId: string
    email: string
    password: string
    role: OrgUserRole
    fullName?: string
  }
): Promise<
  | { ok: true; userId: string; email: string; role: OrgUserRole; created: boolean }
  | { ok: false; error: string }
> {
  const email = opts.email.trim().toLowerCase()
  const password = opts.password
  if (!email) return { ok: false, error: 'Missing email' }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `הסיסמה חייבת להיות באורך ${MIN_PASSWORD_LENGTH} תווים לפחות` }
  }

  const { data: orgRows, error: orgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('client_id', opts.clientId)
    .limit(1)

  if (orgErr || !orgRows?.length) {
    return { ok: false, error: 'Organization not found for client' }
  }

  const orgId = orgRows[0].id as string
  const userMetadata: Record<string, string> = {
    client_id: opts.clientId,
    organization_id: orgId,
  }
  if (opts.fullName?.trim()) {
    userMetadata.full_name = opts.fullName.trim()
  }

  let userId: string | null = null
  let created = false

  try {
    userId = await findAuthUserIdByEmail(admin, email)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to look up user' }
  }

  if (!userId) {
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    })
    if (createErr || !createdUser.user?.id) {
      return { ok: false, error: createErr?.message || 'יצירת משתמש נכשלה' }
    }
    userId = createdUser.user.id
    created = true
  } else {
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    })
    if (updateErr) {
      return { ok: false, error: updateErr.message }
    }
  }

  const { error: ouErr } = await admin.from('organization_users').upsert(
    { organization_id: orgId, user_id: userId, role: opts.role },
    { onConflict: 'organization_id,user_id' }
  )
  if (ouErr) {
    return { ok: false, error: ouErr.message }
  }

  return { ok: true, userId, email, role: opts.role, created }
}
