import type { SupabaseClient } from '@supabase/supabase-js'
import { generateInviteToken, hashInviteToken, normalizeInviteEmail } from '@/lib/resident-portal/crypto'
import type { ResidentPortalRole } from '@/lib/resident-portal/types'
import { logAudit } from '@/lib/audit'

const INVITE_TTL_MS = 1000 * 60 * 60 * 48 // 48h

export type CreateInviteInput = {
  clientId: string
  projectId: string
  residentId: string
  unitId?: string | null
  role?: ResidentPortalRole
  email: string
  createdBy: string | null
}

export async function createResidentPortalInvite(
  admin: SupabaseClient,
  input: CreateInviteInput
): Promise<{ inviteId: string; token: string; expiresAt: string; email: string }> {
  const email = normalizeInviteEmail(input.email)
  if (!email || !email.includes('@')) {
    throw new Error('כתובת דוא״ל לא תקינה')
  }

  const { data: resident, error: rErr } = await admin
    .from('residents')
    .select('id, client_id, project_id, unit_id, deleted_at')
    .eq('id', input.residentId)
    .maybeSingle()

  if (rErr) throw new Error(rErr.message)
  if (!resident || resident.deleted_at) throw new Error('דייר לא נמצא')
  if (resident.client_id !== input.clientId || resident.project_id !== input.projectId) {
    throw new Error('דייר אינו שייך לפרויקט')
  }

  const { data: project, error: pErr } = await admin
    .from('projects')
    .select('id, resident_portal_enabled')
    .eq('id', input.projectId)
    .eq('client_id', input.clientId)
    .maybeSingle()
  if (pErr) throw new Error(pErr.message)
  if (!project) throw new Error('פרויקט לא נמצא')
  if (!project.resident_portal_enabled) {
    throw new Error('פורטל הדיירים אינו מופעל בפרויקט זה')
  }

  const { token, tokenHash } = generateInviteToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
  const unitId = input.unitId ?? resident.unit_id ?? null

  const { data: invite, error } = await admin
    .from('resident_portal_invites')
    .insert({
      client_id: input.clientId,
      project_id: input.projectId,
      resident_id: input.residentId,
      unit_id: unitId,
      role: input.role ?? 'owner',
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: input.createdBy,
    })
    .select('id')
    .single()

  if (error || !invite) {
    throw new Error(error?.message || 'יצירת הזמנה נכשלה')
  }

  await logAudit({
    clientId: input.clientId,
    userId: input.createdBy,
    action: 'portal_invite_created',
    entityType: 'resident_portal_invite',
    entityId: invite.id,
    newValues: { resident_id: input.residentId, email, project_id: input.projectId },
  })

  return { inviteId: invite.id, token, expiresAt, email }
}

export async function acceptResidentPortalInvite(
  admin: SupabaseClient,
  opts: { token: string; userId: string; userEmail: string | null }
): Promise<{ membershipId: string }> {
  const tokenHash = hashInviteToken(opts.token.trim())
  const { data: invite, error } = await admin
    .from('resident_portal_invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!invite) throw new Error('הזמנה לא נמצאה או לא תקפה')
  if (invite.revoked_at) throw new Error('ההזמנה בוטלה')
  if (invite.used_at) throw new Error('ההזמנה כבר נוצלה')
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    throw new Error('תוקף ההזמנה פג')
  }

  const userEmail = normalizeInviteEmail(opts.userEmail || '')
  if (!userEmail || userEmail !== normalizeInviteEmail(invite.email)) {
    throw new Error('יש להתחבר עם כתובת הדוא״ל שאליה נשלחה ההזמנה')
  }

  const { data: project } = await admin
    .from('projects')
    .select('resident_portal_enabled')
    .eq('id', invite.project_id)
    .maybeSingle()
  if (!project?.resident_portal_enabled) {
    throw new Error('פורטל הדיירים אינו מופעל בפרויקט זה')
  }

  // Revoke any previous active membership for this user+resident, then create active.
  await admin
    .from('resident_portal_memberships')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', opts.userId)
    .eq('resident_id', invite.resident_id)
    .eq('status', 'active')

  const { data: membership, error: mErr } = await admin
    .from('resident_portal_memberships')
    .insert({
      user_id: opts.userId,
      resident_id: invite.resident_id,
      unit_id: invite.unit_id,
      client_id: invite.client_id,
      project_id: invite.project_id,
      role: invite.role,
      status: 'active',
    })
    .select('id')
    .single()

  if (mErr || !membership) {
    throw new Error(mErr?.message || 'יצירת חברות נכשלה')
  }

  const { error: uErr } = await admin
    .from('resident_portal_invites')
    .update({ used_at: new Date().toISOString(), used_by: opts.userId })
    .eq('id', invite.id)
    .is('used_at', null)

  if (uErr) {
    throw new Error(`סימון הזמנה כמנוצלת נכשל: ${uErr.message}`)
  }

  // Best-effort: store email on resident if empty
  await admin
    .from('residents')
    .update({ email: invite.email, updated_at: new Date().toISOString() })
    .eq('id', invite.resident_id)
    .is('email', null)

  await logAudit({
    clientId: invite.client_id,
    userId: opts.userId,
    action: 'portal_invite_accepted',
    entityType: 'resident_portal_membership',
    entityId: membership.id,
    newValues: { resident_id: invite.resident_id, invite_id: invite.id },
  })

  return { membershipId: membership.id }
}

export async function revokeResidentPortalMembership(
  admin: SupabaseClient,
  opts: {
    clientId: string
    membershipId: string
    revokedBy: string | null
  }
): Promise<void> {
  const { data, error } = await admin
    .from('resident_portal_memberships')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by: opts.revokedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.membershipId)
    .eq('client_id', opts.clientId)
    .eq('status', 'active')
    .select('id, resident_id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('חברות לא נמצאה או כבר בוטלה')

  await logAudit({
    clientId: opts.clientId,
    userId: opts.revokedBy,
    action: 'portal_membership_revoked',
    entityType: 'resident_portal_membership',
    entityId: data.id,
    oldValues: { resident_id: data.resident_id },
  })
}
