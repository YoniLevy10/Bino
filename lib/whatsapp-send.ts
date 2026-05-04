import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { insertWhatsAppSendFailure } from '@/lib/error-logs-db'

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
      console.error('⚠️ WhatsApp send (credentials): timeout or network error')
      return null
    }

    const data = (await response.json()) as Record<string, unknown>

    if (!response.ok) {
      const metaCode = (data as { error?: { code?: number } }).error?.code
      if (metaCode === 190) {
        console.error('🚨 WHATSAPP_TOKEN_EXPIRED: Meta returned OAuthException code 190 — update whatsapp_access_token in clients table immediately.', JSON.stringify(data))
      } else {
        console.error('⚠️ WhatsApp send failed (credentials):', JSON.stringify(data))
      }
      return null
    }

    return data
  } catch (e) {
    console.error('⚠️ WhatsApp send exception (credentials):', e instanceof Error ? e.message : String(e))
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
    console.error('⚠️ WhatsApp send skipped: missing WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID')
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
      console.error('⚠️ WhatsApp send: timeout or network error')
      return null
    }

    const data = (await response.json()) as Record<string, unknown>

    if (!response.ok) {
      const metaCode = (data as { error?: { code?: number } }).error?.code
      if (metaCode === 190) {
        console.error('🚨 WHATSAPP_TOKEN_EXPIRED: Meta returned OAuthException code 190 — update whatsapp_access_token in clients table immediately.', JSON.stringify(data))
      } else {
        console.error('⚠️ WhatsApp send rejected:', JSON.stringify(data))
      }
      return null
    }

    return data
  } catch (e) {
    console.error('⚠️ WhatsApp send exception:', e instanceof Error ? e.message : String(e))
    return null
  }
}

export async function sendWhatsAppTextMessage(
  to: string,
  body: string,
  creds?: WhatsAppCredentials,
  failureLog?: WhatsAppFailureLog
): Promise<Record<string, unknown> | null> {
  console.log('📤 Sending WhatsApp text message to:', to)

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
    await insertWhatsAppSendFailure(failureLog.clientId, to, body, 'WhatsApp send returned null (timeout/error)')
  }

  return result
}

export async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  bodyParams: string[] = [],
  languageCode = 'he'
): Promise<Record<string, unknown> | null> {
  console.log('📤 Sending WhatsApp template message to:', to, 'template:', templateName)

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

  return sendRawWhatsAppPayload({
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      components,
    },
  })
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

  console.warn('⚠️ WhatsApp text send failed — attempting template:', templateName)
  const templ = await sendWhatsAppTemplateMessage(to, templateName, templateParams, languageCode)
  if (!templ) {
    console.error('⚠️ WhatsApp template send also failed')
  }
  return templ
}
