import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { insertWhatsAppSendFailure } from '@/lib/error-logs-db'
import { getLogger } from '@/lib/logging'

export type WhatsAppFailureLog = {
  clientId: string
}

/** Task 37: WhatsApp Cloud API outbound timeout */
const WHATSAPP_API_TIMEOUT_MS = 15_000

type WhatsAppTemplateComponent = {
  type: string
  parameters?: Array<{
    type: 'text'
    text: string
  }>
}

/** Send using explicit Meta credentials (e.g. from Supabase `clients` row). */
export async function sendRawWhatsAppPayloadWithCredentials(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          ...payload,
        }),
      },
      WHATSAPP_API_TIMEOUT_MS
    )
    if (!response) {
      getLogger().error('WA_SEND', 'timeout or network error (credentials)', new Error('timeout'))
      return null
    }

    const data = (await response.json()) as Record<string, unknown>

    if (!response.ok) {
      const metaCode = (data as { error?: { code?: number } }).error?.code
      if (metaCode === 190) {
        getLogger().error('WA_SEND', 'TOKEN_EXPIRED: Meta OAuthException code 190 — update whatsapp_access_token immediately', new Error('token_expired'), { data: JSON.stringify(data) })
      } else {
        getLogger().error('WA_SEND', 'send failed (credentials)', new Error('meta_error'), { data: JSON.stringify(data) })
      }
      return null
    }

    return data
  } catch (e) {
    getLogger().error('WA_SEND', 'send exception (credentials)', e instanceof Error ? e : new Error(String(e)))
    return null
  }
}

export async function sendWhatsAppTextMessageWithCredentials(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string
): Promise<Record<string, unknown> | null> {
  return sendRawWhatsAppPayloadWithCredentials(phoneNumberId, accessToken, {
    to,
    type: 'text',
    text: {
      body,
    },
  })
}

type WhatsAppCredentials = {
  phoneNumberId?: string
  accessToken?: string
}

async function sendRawWhatsAppPayload(
  payload: Record<string, unknown>,
  creds?: WhatsAppCredentials
): Promise<Record<string, unknown> | null> {
  const accessToken = creds?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = creds?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    getLogger().warn('WA_SEND', 'send skipped: missing credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)')
    return null
  }

  try {
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          ...payload,
        }),
      },
      WHATSAPP_API_TIMEOUT_MS
    )

    if (!response) {
      getLogger().error('WA_SEND', 'timeout or network error', new Error('timeout'))
      return null
    }

    const data = (await response.json()) as Record<string, unknown>

    if (!response.ok) {
      const metaCode = (data as { error?: { code?: number } }).error?.code
      if (metaCode === 190) {
        getLogger().error('WA_SEND', 'TOKEN_EXPIRED: Meta OAuthException code 190 — update whatsapp_access_token immediately', new Error('token_expired'), { data: JSON.stringify(data) })
      } else {
        getLogger().error('WA_SEND', 'send rejected', new Error('meta_error'), { data: JSON.stringify(data) })
      }
      return null
    }

    return data
  } catch (e) {
    getLogger().error('WA_SEND', 'send exception', e instanceof Error ? e : new Error(String(e)))
    return null
  }
}

export async function sendWhatsAppTextMessage(
  to: string,
  body: string,
  creds?: WhatsAppCredentials,
  failureLog?: WhatsAppFailureLog
): Promise<Record<string, unknown> | null> {
  const result = await sendRawWhatsAppPayload(
    {
      to,
      type: 'text',
      text: {
        body,
      },
    },
    creds
  )

  if (!result && failureLog?.clientId) {
    await insertWhatsAppSendFailure(failureLog.clientId, to, body, 'WhatsApp send returned null (timeout/error)', {
      send_kind: 'text',
    })
  }

  return result
}

function buildWhatsAppTemplatePayload(
  to: string,
  templateName: string,
  bodyParams: string[],
  languageCode: string
): Record<string, unknown> {
  const components: WhatsAppTemplateComponent[] = []

  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({
        type: 'text',
        text,
      })),
    })
  }

  return {
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      components,
    },
  }
}

/** Exported for whatsapp-retry cron. */
export function buildWhatsAppTemplatePayloadForRetry(
  to: string,
  templateName: string,
  bodyParams: string[],
  languageCode: string
): Record<string, unknown> {
  return buildWhatsAppTemplatePayload(to, templateName, bodyParams, languageCode)
}

export async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  bodyParams: string[] = [],
  languageCode = 'he'
): Promise<Record<string, unknown> | null> {
  return sendRawWhatsAppPayload(
    buildWhatsAppTemplatePayload(to, templateName, bodyParams, languageCode)
  )
}

export async function sendWhatsAppTemplateMessageWithCredentials(
  to: string,
  templateName: string,
  bodyParams: string[] = [],
  creds: WhatsAppCredentials,
  languageCode = 'he',
  failureLog?: WhatsAppFailureLog
): Promise<Record<string, unknown> | null> {
  const phoneNumberId = creds.phoneNumberId
  const accessToken = creds.accessToken
  if (!phoneNumberId || !accessToken) {
    getLogger().warn('WA_SEND', 'template send skipped: missing credentials')
    return null
  }

  const result = await sendRawWhatsAppPayloadWithCredentials(
    phoneNumberId,
    accessToken,
    buildWhatsAppTemplatePayload(to, templateName, bodyParams, languageCode)
  )

  if (!result && failureLog?.clientId) {
    await insertWhatsAppSendFailure(
      failureLog.clientId,
      to,
      templateName,
      'WhatsApp template send returned null (timeout/error)',
      {
        send_kind: 'template',
        template_params: bodyParams,
        template_language: languageCode,
      }
    )
  }

  return result
}

export async function sendWhatsAppTextWithTemplateFallback(
  to: string,
  body: string,
  templateName: string,
  templateParams: string[] = [],
  languageCode = 'he'
) {
  const direct = await sendWhatsAppTextMessage(to, body)
  if (direct) return direct

  getLogger().warn('WA_SEND', 'text send failed, attempting template fallback', { templateName })
  const templ = await sendWhatsAppTemplateMessage(to, templateName, templateParams, languageCode)
  if (!templ) {
    getLogger().warn('WA_SEND', 'template send also failed', { templateName })
  }
  return templ
}

export async function sendWhatsAppInteractivePayloadWithCredentials(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  return sendRawWhatsAppPayloadWithCredentials(phoneNumberId, accessToken, payload)
}

export async function sendWhatsAppInteractivePayload(
  payload: Record<string, unknown>,
  creds?: WhatsAppCredentials,
  failureLog?: WhatsAppFailureLog
): Promise<Record<string, unknown> | null> {
  const result = await sendRawWhatsAppPayload(payload, creds)
  if (!result && failureLog?.clientId) {
    const to = String(payload.to || '')
    await insertWhatsAppSendFailure(
      failureLog.clientId,
      to,
      JSON.stringify(payload.interactive ?? payload),
      'WhatsApp interactive send returned null'
    )
  }
  return result
}
