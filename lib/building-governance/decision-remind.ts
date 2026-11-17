/**
 * Remind pending decision signers via SMS/email.
 * WhatsApp: only inside Meta 24h session (free-form). No cold HSM — document requirement.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isBuildingGovernanceAutoNotifyEnabled,
  isGovernanceOutboundPhoneAllowed,
} from '@/lib/building-governance/auto-notify-gate'
import { sendServiceSmsAndWhatsApp } from '@/lib/building-governance/service-notify'
import { sendResendEmail } from '@/lib/email-resend'
import {
  absoluteBuildingSignUrl,
} from '@/lib/building-governance/signature-link-notify'
import { residentDecisionInvitePath } from '@/lib/building-governance/roles'
import { GOVERNANCE_WA_HSM_NOTE_HE } from '@/lib/building-governance/decision-summary'
import { getPublicAppUrl } from '@/lib/public-app-url'
import { getLogger } from '@/lib/logging'
import { logAudit } from '@/lib/audit'

const BATCH_LIMIT = 40
const BETWEEN_MS = 300

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function portalInviteAbsoluteUrl(projectId: string, decisionId: string): string {
  const path = residentDecisionInvitePath(projectId, { decisionId })
  const base = getPublicAppUrl()
  if (base) return `${base}${path}`
  return path
}

export type DecisionRemindResult = {
  attempted: number
  sms_sent: number
  email_sent: number
  wa_session_sent: number
  wa_skipped_outside_session: number
  skipped: number
  errors: number
  auto_notify_enabled: boolean
  wa_hsm_note_he: string
}

export async function remindPendingDecisionSigners(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    projectName?: string | null
    decisionId: string
    decisionTitle: string
    /** Prefer SMS; WA only when session allows (service-notify). */
    channels?: Array<'sms' | 'email'>
    sendMessages?: boolean
    limit?: number
    userId?: string | null
  }
): Promise<DecisionRemindResult> {
  const autoOn = isBuildingGovernanceAutoNotifyEnabled()
  const wantSms = (opts.channels ?? ['sms']).includes('sms')
  const wantEmail = (opts.channels ?? ['sms']).includes('email')
  const sendMessages = opts.sendMessages !== false
  const limit = Math.min(BATCH_LIMIT, Math.max(1, opts.limit ?? BATCH_LIMIT))

  const result: DecisionRemindResult = {
    attempted: 0,
    sms_sent: 0,
    email_sent: 0,
    wa_session_sent: 0,
    wa_skipped_outside_session: 0,
    skipped: 0,
    errors: 0,
    auto_notify_enabled: autoOn,
    wa_hsm_note_he: GOVERNANCE_WA_HSM_NOTE_HE,
  }

  const { data: pending, error } = await admin
    .from('building_signature_requests')
    .select(
      'id, token, signer_name, signer_phone, signer_email, resident_id, status'
    )
    .eq('client_id', opts.clientId)
    .eq('decision_id', opts.decisionId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    getLogger().warn('BUILDING_GOVERNANCE', 'decision remind list failed', {
      err: error.message,
      clientId: opts.clientId,
    })
    throw new Error(error.message)
  }

  const rows = (pending ?? []) as Array<{
    id: string
    token: string
    signer_name: string
    signer_phone: string | null
    signer_email?: string | null
    resident_id: string | null
    status: string
  }>

  const title = opts.decisionTitle.trim() || 'החלטת ועד'
  const building = (opts.projectName || '').trim() || 'הבניין'
  const portalUrl = portalInviteAbsoluteUrl(opts.projectId, opts.decisionId)

  for (const row of rows) {
    result.attempted += 1
    const name = (row.signer_name || '').trim() || 'דייר/ת'
    const phone = (row.signer_phone || '').trim()
    const email = (row.signer_email || '').trim()
    const phoneAllowed = isGovernanceOutboundPhoneAllowed(phone)

    let didSomething = false

    if (wantSms && sendMessages && phone) {
      if (!phoneAllowed || !autoOn) {
        result.skipped += 1
      } else {
        const message =
          `Bino: תזכורת — נדרשת חתימה על "${title}" ב-${building}. ` +
          (row.resident_id
            ? `כניסה: ${portalUrl}`
            : `קישור: ${absoluteBuildingSignUrl(row.token)}`)
        try {
          const send = await sendServiceSmsAndWhatsApp(admin, {
            clientId: opts.clientId,
            phone,
            message: message.slice(0, 900),
            channel: 'building_decision_reminder',
            preferWhatsApp: true,
          })
          if (send.whatsapp) {
            result.wa_session_sent += 1
            didSomething = true
          } else if (send.waMetaBlocked) {
            result.wa_skipped_outside_session += 1
          }
          if (send.sms) {
            result.sms_sent += 1
            didSomething = true
          }
          if (!send.sms && !send.whatsapp && !send.skipped) {
            result.errors += 1
          }
        } catch {
          result.errors += 1
        }
      }
    } else if (wantSms && sendMessages && !phone) {
      result.skipped += 1
    }

    if (wantEmail && sendMessages && email.includes('@') && autoOn) {
      const body = [
        `שלום ${name},`,
        '',
        `תזכורת: נדרשת חתימה על החלטת ועד "${title}"`,
        `בניין: ${building}`,
        '',
        row.resident_id
          ? `כניסה לאזור האישי: ${portalUrl}`
          : `קישור חתימה: ${absoluteBuildingSignUrl(row.token)}`,
        '',
        'Bino',
      ].join('\n')
      try {
        const mail = await sendResendEmail({
          to: email,
          subject: `תזכורת חתימה — ${title}`,
          body,
        })
        if (mail.ok) {
          result.email_sent += 1
          didSomething = true
        } else {
          result.errors += 1
        }
      } catch {
        result.errors += 1
      }
    }

    if (!didSomething && !wantSms && !wantEmail) {
      result.skipped += 1
    }

    if (BETWEEN_MS > 0) await sleep(BETWEEN_MS)
  }

  await logAudit({
    clientId: opts.clientId,
    userId: opts.userId ?? null,
    action: 'building_decision_reminder_sent',
    entityType: 'building_decision',
    entityId: opts.decisionId,
    newValues: {
      attempted: result.attempted,
      sms_sent: result.sms_sent,
      email_sent: result.email_sent,
      wa_session_sent: result.wa_session_sent,
      wa_skipped_outside_session: result.wa_skipped_outside_session,
    },
  })

  return result
}
