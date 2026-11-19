import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isBuildingGovernanceAutoNotifyEnabled,
  isGovernanceOutboundPhoneAllowed,
} from '@/lib/building-governance/auto-notify-gate'
import {
  absoluteBuildingSignUrl,
} from '@/lib/building-governance/signature-link-notify'
import {
  residentDecisionInvitePath,
} from '@/lib/building-governance/roles'
import { sendServiceSmsAndWhatsApp } from '@/lib/building-governance/service-notify'
import { sendResendEmail } from '@/lib/email-resend'
import { getPublicAppUrl } from '@/lib/shared/public-app-url'
import { getLogger } from '@/lib/shared/logging'
import { logAudit } from '@/lib/audit'

const BATCH_LIMIT = 80
const BETWEEN_MS = 300

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export type DecisionNotifyChannel = 'sms' | 'email'

type ResidentLite = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  unit_id: string | null
  apartment_number: string | null
}

function portalInviteAbsoluteUrl(projectId: string, decisionId: string): string {
  const path = residentDecisionInvitePath(projectId, { decisionId })
  const base = getPublicAppUrl()
  if (base) return `${base}${path}`
  // Local webpack without NEXT_PUBLIC_APP_URL — relative still useful in UI copy.
  return path
}

async function ensureSignatureRequest(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    decisionId: string
    resident: ResidentLite
    expiresInDays: number
  }
): Promise<{ id: string; token: string } | null> {
  const { data: existing } = await admin
    .from('building_signature_requests')
    .select('id, token')
    .eq('client_id', opts.clientId)
    .eq('decision_id', opts.decisionId)
    .eq('resident_id', opts.resident.id)
    .maybeSingle()

  if (existing) {
    return {
      id: (existing as { id: string }).id,
      token: (existing as { token: string }).token,
    }
  }

  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(
    Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000
  ).toISOString()
  const name = (opts.resident.full_name || '').trim() || 'דייר/ת'
  const phone = (opts.resident.phone || '').trim() || null
  const email = (opts.resident.email || '').trim() || null

  const { data: inserted, error } = await admin
    .from('building_signature_requests')
    .insert({
      client_id: opts.clientId,
      project_id: opts.projectId,
      decision_id: opts.decisionId,
      token,
      signer_name: name,
      signer_phone: phone,
      signer_email: email,
      resident_id: opts.resident.id,
      unit_id: opts.resident.unit_id,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id, token')
    .single()

  if (error || !inserted) {
    // Race on unique (decision_id, resident_id) — re-read.
    if (error?.code === '23505' || /duplicate|unique/i.test(error?.message || '')) {
      const { data: again } = await admin
        .from('building_signature_requests')
        .select('id, token')
        .eq('client_id', opts.clientId)
        .eq('decision_id', opts.decisionId)
        .eq('resident_id', opts.resident.id)
        .maybeSingle()
      if (again) {
        return {
          id: (again as { id: string }).id,
          token: (again as { token: string }).token,
        }
      }
    }
    getLogger().warn('BUILDING_GOVERNANCE', 'decision resident sig insert failed', {
      err: error?.message,
      clientId: opts.clientId,
    })
    return null
  }

  return {
    id: (inserted as { id: string }).id,
    token: (inserted as { token: string }).token,
  }
}

/**
 * Create signature stubs + send portal deep links (SMS and/or email) to selected/all residents.
 * Primary link = /resident/join/{project}?next=/resident/decisions — not naked public token.
 * Public token URL remains available as optional fallback in the return payload.
 */
export async function notifyDecisionToResidents(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    projectName?: string | null
    decisionId: string
    decisionTitle: string
    /** Empty / omitted + all_residents → load all project residents. */
    residentIds?: string[]
    allResidents?: boolean
    channels?: DecisionNotifyChannel[]
    /** When false, create stubs/recipients only — never SMS/email. Default true. */
    sendMessages?: boolean
    includePublicFallbackLink?: boolean
    expiresInDays?: number
    userId?: string | null
    /** Cap recipients (default 80). */
    limit?: number
  }
): Promise<{
  attempted: number
  created: number
  sms_sent: number
  email_sent: number
  skipped: number
  errors: number
  auto_notify_enabled: boolean
  portal_path_sample: string | null
}> {
  const channels = Array.from(new Set(opts.channels || []))
  const wantSms = channels.includes('sms')
  const wantEmail = channels.includes('email')
  const sendMessages = opts.sendMessages !== false
  const autoOn = isBuildingGovernanceAutoNotifyEnabled()
  const limit = Math.min(BATCH_LIMIT, Math.max(1, opts.limit ?? BATCH_LIMIT))
  const expiresInDays = opts.expiresInDays ?? 14
  const portalSample = portalInviteAbsoluteUrl(opts.projectId, opts.decisionId)

  let query = admin
    .from('residents')
    .select('id, full_name, phone, email, unit_id, apartment_number')
    .eq('client_id', opts.clientId)
    .eq('project_id', opts.projectId)
    .is('deleted_at', null)
    .order('full_name', { ascending: true })
    .limit(limit)

  if (!opts.allResidents && opts.residentIds?.length) {
    query = query.in('id', opts.residentIds.slice(0, limit))
  } else if (!opts.allResidents) {
    return {
      attempted: 0,
      created: 0,
      sms_sent: 0,
      email_sent: 0,
      skipped: 0,
      errors: 0,
      auto_notify_enabled: autoOn,
      portal_path_sample: portalSample,
    }
  }

  const { data: rows, error } = await query
  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'decision notify resident list failed',
      new Error(error.message),
      { clientId: opts.clientId }
    )
    return {
      attempted: 0,
      created: 0,
      sms_sent: 0,
      email_sent: 0,
      skipped: 0,
      errors: 1,
      auto_notify_enabled: autoOn,
      portal_path_sample: portalSample,
    }
  }

  const residents = (rows ?? []) as ResidentLite[]
  const building = opts.projectName?.trim() || 'הבניין'
  const title = opts.decisionTitle.trim().slice(0, 80) || 'החלטת ועד'
  const portalUrl = portalSample

  let attempted = 0
  let created = 0
  let smsSent = 0
  let emailSent = 0
  let skipped = 0
  let errors = 0

  for (const resident of residents) {
    attempted++
    const sig = await ensureSignatureRequest(admin, {
      clientId: opts.clientId,
      projectId: opts.projectId,
      decisionId: opts.decisionId,
      resident,
      expiresInDays,
    })
    if (!sig) {
      errors++
      continue
    }
    created++

    const phone = (resident.phone || '').trim()
    const email = (resident.email || '').trim()
    const name = (resident.full_name || '').trim() || 'דייר/ת'
    const phoneAllowed = isGovernanceOutboundPhoneAllowed(phone)
    const canSms = sendMessages && wantSms && Boolean(phone) && phoneAllowed
    const canEmail =
      sendMessages && wantEmail && Boolean(email) && email.includes('@') && autoOn

    let smsStatus: 'sent' | 'failed' | 'skipped' = 'skipped'
    let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped'
    const channelList: string[] = []
    if (wantSms) channelList.push('sms')
    if (wantEmail) channelList.push('email')

    if (wantSms && sendMessages) {
      if (!phone) {
        smsStatus = 'skipped'
        skipped++
      } else if (!phoneAllowed) {
        // Local/preview: real phones are never messaged even with AUTO_NOTIFY=true.
        smsStatus = 'skipped'
        skipped++
        getLogger().info('BUILDING_GOVERNANCE', 'decision SMS skipped non-demo phone', {
          clientId: opts.clientId,
          decisionId: opts.decisionId,
        })
      } else if (!autoOn) {
        smsStatus = 'skipped'
      } else {
        // No emoji — 019SMS rejects emoji with silent XML failure.
        // Primary deep link = resident portal (phone + OTP password), not naked public token.
        let message =
          `Bino: שלום ${name}, נדרשת חתימה על "${title}" ב-${building}. ` +
          `כניסה לאזור האישי (טלפון + סיסמה מ-SMS): ${portalUrl}`
        if (opts.includePublicFallbackLink) {
          message += ` גיבוי: ${absoluteBuildingSignUrl(sig.token)}`
        }
        try {
          const result = await sendServiceSmsAndWhatsApp(admin, {
            clientId: opts.clientId,
            phone,
            message: message.slice(0, 900),
            channel: 'building_decision_resident',
            preferWhatsApp: false,
          })
          if (result.sms || result.whatsapp) {
            smsStatus = 'sent'
            smsSent++
          } else {
            smsStatus = result.skipped ? 'skipped' : 'failed'
          }
        } catch {
          smsStatus = 'failed'
          errors++
        }
      }
    }

    if (canEmail) {
      const body = [
        `שלום ${name},`,
        '',
        `נדרשת חתימה על החלטת ועד: "${title}"`,
        `בניין: ${building}`,
        resident.apartment_number ? `דירה: ${resident.apartment_number}` : '',
        '',
        'היכנסו לאזור האישי של הדיירים (טלפון + סיסמה חד־פעמית ב-SMS):',
        portalUrl,
        '',
        opts.includePublicFallbackLink
          ? `קישור חתימה ישיר (גיבוי): ${absoluteBuildingSignUrl(sig.token)}`
          : '',
        '',
        'Bino',
      ]
        .filter((line) => line !== '')
        .join('\n')

      try {
        const mail = await sendResendEmail({
          to: email,
          subject: `חתימה על החלטה — ${title}`,
          body,
        })
        if (mail.ok) {
          emailStatus = 'sent'
          emailSent++
        } else {
          emailStatus = 'failed'
          getLogger().warn('BUILDING_GOVERNANCE', 'decision email failed', {
            err: mail.error,
            clientId: opts.clientId,
          })
        }
      } catch {
        emailStatus = 'failed'
        errors++
      }
    } else if (wantEmail && sendMessages) {
      emailStatus = 'skipped'
    }

    const now = new Date().toISOString()
    await admin.from('building_decision_recipients').upsert(
      {
        client_id: opts.clientId,
        project_id: opts.projectId,
        decision_id: opts.decisionId,
        resident_id: resident.id,
        unit_id: resident.unit_id,
        signature_request_id: sig.id,
        channels: channelList,
        sms_status: smsStatus,
        email_status: emailStatus,
        portal_path: residentDecisionInvitePath(opts.projectId, {
          decisionId: opts.decisionId,
        }),
        updated_at: now,
      },
      { onConflict: 'decision_id,resident_id' }
    )

    await logAudit({
      clientId: opts.clientId,
      userId: opts.userId ?? null,
      action: 'building_decision_resident_notified',
      entityType: 'building_decision',
      entityId: opts.decisionId,
      newValues: {
        resident_id: resident.id,
        sms: smsStatus,
        email: emailStatus,
        signature_request_id: sig.id,
        send_messages: sendMessages,
      },
    })

    if (sendMessages && (canSms || canEmail) && residents.indexOf(resident) < residents.length - 1) {
      await sleep(BETWEEN_MS)
    }
  }

  return {
    attempted,
    created,
    sms_sent: smsSent,
    email_sent: emailSent,
    skipped,
    errors,
    auto_notify_enabled: autoOn,
    portal_path_sample: portalSample,
  }
}
