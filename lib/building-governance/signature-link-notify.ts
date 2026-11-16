import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'
import {
  buildingSignPublicPath,
} from '@/lib/building-governance/roles'
import { sendServiceSmsAndWhatsApp } from '@/lib/building-governance/service-notify'
import { getPublicAppUrl } from '@/lib/public-app-url'
import { getLogger } from '@/lib/logging'
import { logAudit } from '@/lib/audit'

export function absoluteBuildingSignUrl(token: string): string {
  const path = buildingSignPublicPath(token)
  const base = getPublicAppUrl()
  return base ? `${base}${path}` : path
}

/** Send one signature link to a signer phone (SMS and/or in-session WA). */
export async function notifySignatureLink(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    decisionId: string
    decisionTitle: string
    signerName: string
    signerPhone: string | null | undefined
    token: string
    signatureRequestId?: string
    userId?: string | null
  }
): Promise<{ sent: boolean; sms: boolean; whatsapp: boolean; waMetaBlocked?: boolean }> {
  if (!isBuildingGovernanceAutoNotifyEnabled()) {
    return { sent: false, sms: false, whatsapp: false }
  }
  const phone = opts.signerPhone?.trim()
  if (!phone) return { sent: false, sms: false, whatsapp: false }

  const url = absoluteBuildingSignUrl(opts.token)
  const title = opts.decisionTitle.trim().slice(0, 80) || 'החלטת ועד'
  const message = `Bino: שלום ${opts.signerName.trim()}, נדרשת חתימה על "${title}". קישור: ${url}`

  const result = await sendServiceSmsAndWhatsApp(admin, {
    clientId: opts.clientId,
    phone,
    message,
    channel: 'building_decision_sign',
  })

  if (result.sms || result.whatsapp) {
    await logAudit({
      clientId: opts.clientId,
      userId: opts.userId ?? null,
      action: 'building_signature_link_sent',
      entityType: 'building_signature_request',
      entityId: opts.signatureRequestId ?? opts.decisionId,
      newValues: {
        decision_id: opts.decisionId,
        project_id: opts.projectId,
        sms: result.sms,
        whatsapp: result.whatsapp,
        wa_meta_blocked: result.waMetaBlocked ?? false,
      },
    })
  }

  return {
    sent: Boolean(result.sms || result.whatsapp),
    sms: result.sms,
    whatsapp: result.whatsapp,
    waMetaBlocked: result.waMetaBlocked,
  }
}

type CommitteeMemberLite = {
  full_name: string
  phone: string | null
  role: string
}

/**
 * Create pending signature requests for active committee members with phones,
 * then auto-notify each (idempotent: skips names/phones already pending/signed).
 */
export async function fanoutSignatureRequestsToCommittee(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    decisionId: string
    decisionTitle: string
    expiresInDays?: number
    userId?: string | null
    /** Prefer signers; if none with phones, include all active members with phones. */
    preferSigners?: boolean
  }
): Promise<{ created: number; notified: number }> {
  if (!isBuildingGovernanceAutoNotifyEnabled()) {
    return { created: 0, notified: 0 }
  }

  const { data: members, error } = await admin
    .from('building_committee_members')
    .select('full_name, phone, role')
    .eq('client_id', opts.clientId)
    .eq('project_id', opts.projectId)
    .eq('is_active', true)
    .limit(100)

  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'committee fanout load failed',
      new Error(error.message),
      { clientId: opts.clientId }
    )
    return { created: 0, notified: 0 }
  }

  const rows = (members ?? []) as CommitteeMemberLite[]
  const withPhone = rows.filter((m) => (m.phone || '').trim())
  const signers = withPhone.filter((m) => m.role === 'signer' || m.role === 'chair')
  const targets =
    opts.preferSigners !== false && signers.length > 0 ? signers : withPhone

  if (targets.length === 0) return { created: 0, notified: 0 }

  const { data: existing } = await admin
    .from('building_signature_requests')
    .select('signer_name, signer_phone, status')
    .eq('client_id', opts.clientId)
    .eq('decision_id', opts.decisionId)
    .limit(200)

  const existingKeys = new Set(
    (existing ?? []).map((s) => {
      const row = s as { signer_name?: string; signer_phone?: string | null }
      return `${(row.signer_name || '').trim().toLowerCase()}|${(row.signer_phone || '').trim()}`
    })
  )

  const days = opts.expiresInDays ?? 14
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  let created = 0
  let notified = 0

  for (const member of targets) {
    const phone = (member.phone || '').trim()
    const name = member.full_name.trim()
    const key = `${name.toLowerCase()}|${phone}`
    if (existingKeys.has(key)) continue

    const token = randomBytes(24).toString('hex')
    const { data: sig, error: insErr } = await admin
      .from('building_signature_requests')
      .insert({
        client_id: opts.clientId,
        project_id: opts.projectId,
        decision_id: opts.decisionId,
        token,
        signer_name: name,
        signer_phone: phone || null,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id, token')
      .single()

    if (insErr || !sig) {
      getLogger().warn('BUILDING_GOVERNANCE', 'fanout signature insert failed', {
        err: insErr?.message,
        clientId: opts.clientId,
      })
      continue
    }

    created++
    existingKeys.add(key)
    const send = await notifySignatureLink(admin, {
      clientId: opts.clientId,
      projectId: opts.projectId,
      decisionId: opts.decisionId,
      decisionTitle: opts.decisionTitle,
      signerName: name,
      signerPhone: phone,
      token: (sig as { token: string }).token,
      signatureRequestId: (sig as { id: string }).id,
      userId: opts.userId,
    })
    if (send.sent) notified++
  }

  return { created, notified }
}
