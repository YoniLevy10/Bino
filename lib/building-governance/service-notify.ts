import type { SupabaseClient } from '@supabase/supabase-js'
import { send019StaffSms } from '@/lib/sms/sms'
import { sendWhatsAppTextMessageWithCredentials } from '@/lib/whatsapp/whatsapp-send'
import { isWithinWhatsAppSessionWindow } from '@/lib/whatsapp/whatsapp-message-store'
import { normalizePhone } from '@/lib/residents/residents-whatsapp'
import { getLogger } from '@/lib/shared/logging'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'

export type TenantNotifyCreds = {
  clientName: string
  managerPhone: string | null
  smsSenderName: string | null
  whatsappPhoneNumberId: string | null
  whatsappAccessToken: string | null
}

export type ServiceNotifyResult = {
  skipped: boolean
  reason?: string
  sms: boolean
  whatsapp: boolean
  /** Free-form WA only works inside Meta 24h session; no approved governance template yet. */
  waMetaBlocked?: boolean
}

/** Load tenant SMS/WA credentials for service notifies (admin / service role). */
export async function loadTenantNotifyCreds(
  admin: SupabaseClient,
  clientId: string
): Promise<TenantNotifyCreds> {
  const { data } = await admin
    .from('clients')
    .select(
      'name, manager_phone, sms_sender_name, whatsapp_phone_number_id, whatsapp_access_token'
    )
    .eq('id', clientId)
    .maybeSingle()

  const row = data as {
    name?: string | null
    manager_phone?: string | null
    sms_sender_name?: string | null
    whatsapp_phone_number_id?: string | null
    whatsapp_access_token?: string | null
  } | null

  return {
    clientName: row?.name?.trim() || 'Bino',
    managerPhone: row?.manager_phone?.trim() || null,
    smsSenderName: row?.sms_sender_name?.trim() || null,
    whatsappPhoneNumberId: row?.whatsapp_phone_number_id?.trim() || null,
    whatsappAccessToken: row?.whatsapp_access_token?.trim() || null,
  }
}

/**
 * Hebrew service message via SMS and/or WhatsApp (session window only for free-form WA).
 * No emoji in SMS (sanitized in send019StaffSms). No cold Meta templates for governance yet.
 */
export async function sendServiceSmsAndWhatsApp(
  admin: SupabaseClient,
  opts: {
    clientId: string
    phone: string | null | undefined
    message: string
    channel: string
    creds?: TenantNotifyCreds
    /** Prefer WA when in-session; always try SMS as backup if WA fails. */
    preferWhatsApp?: boolean
  }
): Promise<ServiceNotifyResult> {
  if (!isBuildingGovernanceAutoNotifyEnabled()) {
    return { skipped: true, reason: 'auto_notify_disabled', sms: false, whatsapp: false }
  }

  const phoneRaw = (opts.phone || '').trim()
  if (!phoneRaw || phoneRaw.includes('@')) {
    return { skipped: true, reason: 'no_phone', sms: false, whatsapp: false }
  }

  const message = opts.message.trim()
  if (!message) {
    return { skipped: true, reason: 'empty_message', sms: false, whatsapp: false }
  }

  const creds = opts.creds ?? (await loadTenantNotifyCreds(admin, opts.clientId))
  const logger = getLogger()
  let smsOk = false
  let waOk = false
  let waMetaBlocked = false

  const preferWa = opts.preferWhatsApp !== false
  const waReady = Boolean(creds.whatsappPhoneNumberId && creds.whatsappAccessToken)
  const normalized = normalizePhone(phoneRaw)

  if (preferWa && waReady && normalized) {
    const inSession = await isWithinWhatsAppSessionWindow(admin, opts.clientId, normalized)
    if (inSession) {
      try {
        const wa = await sendWhatsAppTextMessageWithCredentials(
          creds.whatsappPhoneNumberId!,
          creds.whatsappAccessToken!,
          normalized,
          message
        )
        waOk = Boolean(wa)
      } catch (e) {
        logger.warn('BUILDING_GOVERNANCE', 'service WA send failed', {
          channel: opts.channel,
          err: e instanceof Error ? e.message : String(e),
        })
      }
    } else {
      waMetaBlocked = true
      logger.info('BUILDING_GOVERNANCE', 'WA free-form skipped outside 24h session', {
        channel: opts.channel,
        clientId: opts.clientId,
      })
    }
  }

  if (!waOk) {
    try {
      smsOk = await send019StaffSms(phoneRaw, message, creds.smsSenderName, {
        channel: opts.channel,
        clientId: opts.clientId,
      })
    } catch (e) {
      logger.warn('BUILDING_GOVERNANCE', 'service SMS send failed', {
        channel: opts.channel,
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return {
    skipped: false,
    sms: smsOk,
    whatsapp: waOk,
    waMetaBlocked: waMetaBlocked || undefined,
  }
}

/** Notify the tenant manager phone (SMS / in-session WA). */
export async function notifyTenantManagerService(
  admin: SupabaseClient,
  opts: {
    clientId: string
    message: string
    channel: string
  }
): Promise<ServiceNotifyResult> {
  const creds = await loadTenantNotifyCreds(admin, opts.clientId)
  return sendServiceSmsAndWhatsApp(admin, {
    clientId: opts.clientId,
    phone: creds.managerPhone,
    message: opts.message,
    channel: opts.channel,
    creds,
  })
}
