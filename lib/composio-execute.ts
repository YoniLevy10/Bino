/**
 * Minimal Composio Tools API client (REST v3.1).
 * Used for Meta WhatsApp template management — not for marketing blasts.
 */

import { fetchWithTimeout } from '@/lib/fetch-timeout'

const COMPOSIO_EXECUTE_BASE = 'https://backend.composio.dev/api/v3.1/tools/execute'

export const COMPOSIO_NOT_CONNECTED_HE = 'יש לחבר Composio / Meta'

export type ComposioExecuteOk<T = unknown> = {
  ok: true
  data: T
  raw: unknown
}

export type ComposioExecuteErr = {
  ok: false
  code: 'COMPOSIO_NOT_CONFIGURED' | 'COMPOSIO_TIMEOUT' | 'COMPOSIO_HTTP' | 'COMPOSIO_TOOL_FAILED'
  messageHe: string
  message: string
  status?: number
  raw?: unknown
}

export type ComposioExecuteResult<T = unknown> = ComposioExecuteOk<T> | ComposioExecuteErr

export function getComposioApiKey(): string | null {
  const key = process.env.COMPOSIO_API_KEY?.trim()
  return key || null
}

export function getComposioUserId(): string {
  return process.env.COMPOSIO_USER_ID?.trim() || 'bino-platform'
}

/** Connected WhatsApp account id/alias from Composio (e.g. whatsapp_lookum-behead). */
export function getComposioWhatsAppConnectedAccountId(): string | null {
  const id =
    process.env.COMPOSIO_WHATSAPP_CONNECTED_ACCOUNT_ID?.trim() ||
    process.env.COMPOSIO_WHATSAPP_ACCOUNT_ID?.trim() ||
    ''
  return id || null
}

export function isComposioWhatsAppConfigured(): boolean {
  return Boolean(getComposioApiKey() && getComposioWhatsAppConnectedAccountId())
}

type ExecuteOptions = {
  toolSlug: string
  arguments: Record<string, unknown>
  /** Override env connected account (alias or id). */
  connectedAccountId?: string | null
  userId?: string
  version?: string
  timeoutMs?: number
}

/**
 * Execute a Composio tool. Returns a structured Hebrew-friendly error when not connected.
 */
export async function executeComposioTool<T = unknown>(
  options: ExecuteOptions
): Promise<ComposioExecuteResult<T>> {
  const apiKey = getComposioApiKey()
  const connectedAccountId =
    options.connectedAccountId?.trim() || getComposioWhatsAppConnectedAccountId()

  if (!apiKey || !connectedAccountId) {
    return {
      ok: false,
      code: 'COMPOSIO_NOT_CONFIGURED',
      messageHe: COMPOSIO_NOT_CONNECTED_HE,
      message: 'COMPOSIO_API_KEY and COMPOSIO_WHATSAPP_CONNECTED_ACCOUNT_ID are required',
    }
  }

  const userId = options.userId?.trim() || getComposioUserId()
  const version = options.version?.trim() || 'latest'
  const url = `${COMPOSIO_EXECUTE_BASE}/${encodeURIComponent(options.toolSlug)}`

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        user_id: userId,
        version,
        connected_account_id: connectedAccountId,
        arguments: options.arguments,
      }),
    },
    options.timeoutMs ?? 25_000
  )

  if (!res) {
    return {
      ok: false,
      code: 'COMPOSIO_TIMEOUT',
      messageHe: 'תם הזמן בפנייה ל-Composio',
      message: 'Composio request timed out',
    }
  }

  let raw: unknown = null
  try {
    raw = await res.json()
  } catch {
    raw = null
  }

  if (!res.ok) {
    const msg = extractComposioErrorMessage(raw) || `Composio HTTP ${res.status}`
    const he =
      res.status === 401 || res.status === 403
        ? COMPOSIO_NOT_CONNECTED_HE
        : `Composio נכשל (${res.status})`
    return {
      ok: false,
      code: 'COMPOSIO_HTTP',
      messageHe: he,
      message: msg,
      status: res.status,
      raw,
    }
  }

  const envelope = raw as {
    successful?: boolean
    success?: boolean
    error?: string | null
    data?: unknown
  } | null

  const successful =
    envelope?.successful === true ||
    envelope?.success === true ||
    (envelope?.error == null && envelope?.data != null)

  if (!successful && envelope?.error) {
    return {
      ok: false,
      code: 'COMPOSIO_TOOL_FAILED',
      messageHe: 'יצירה/סנכרון תבנית ב-Meta נכשל',
      message: String(envelope.error),
      raw,
    }
  }

  const data = (envelope?.data ?? raw) as T
  return { ok: true, data, raw }
}

function extractComposioErrorMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.error === 'string' && o.error.trim()) return o.error.trim()
  if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()
  const errObj = o.error
  if (errObj && typeof errObj === 'object') {
    const m = (errObj as { message?: unknown }).message
    if (typeof m === 'string' && m.trim()) return m.trim()
  }
  return null
}
