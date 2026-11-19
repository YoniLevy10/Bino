import { fetchWithTimeout } from '@/lib/shared/fetch-timeout'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadPalGateCredentialsForClient,
  loadPalGatePilotCredentials,
} from '@/lib/palgate/credentials'
import { generatePalGateDerivedToken } from '@/lib/palgate/token'

export type PalGateOpenResult =
  | { ok: true; deviceId: string; outputNum: number; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }

function buildOpenUrl(baseUrl: string, deviceId: string, outputNum: number): string {
  const q = new URLSearchParams({
    openBy: '100',
    outputNum: String(outputNum),
  })
  return `${baseUrl}/v1/bt/device/${encodeURIComponent(deviceId)}/open-gate?${q.toString()}`
}

/**
 * Open the configured PalGate device (Savion pilot credentials from env).
 * Server-only — never call from the browser.
 */
export async function openPalGateDevice(opts?: {
  outputNum?: number
  admin?: SupabaseClient
  clientId?: string
}): Promise<PalGateOpenResult> {
  let creds
  try {
    if (opts?.admin && opts.clientId) {
      creds = await loadPalGateCredentialsForClient(opts.admin, opts.clientId)
    } else {
      creds = loadPalGatePilotCredentials()
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const outputNum = opts?.outputNum ?? creds.outputNum
  const derived = generatePalGateDerivedToken(creds.sessionToken, creds.phoneNumber, creds.tokenType)
  const url = buildOpenUrl(creds.baseUrl, creds.deviceId, outputNum)

  const res = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'Accept-Language': 'he-IL,he;q=0.9',
        'Content-Type': 'application/json',
        'User-Agent': 'okhttp/4.9.3',
        'X-Bt-Token': derived,
      },
    },
    12_000
  )

  if (!res) {
    return { ok: false, error: 'פסק זמן בפנייה ל־PalGate' }
  }

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = await res.text().catch(() => null)
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `PalGate HTTP ${res.status}`,
      status: res.status,
      response: body,
    }
  }

  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  if (obj && (obj.err || (typeof obj.status === 'string' && obj.status !== 'ok'))) {
    const msg =
      (typeof obj.msg === 'string' && obj.msg) ||
      (typeof obj.err === 'string' && obj.err) ||
      'בקשת פתיחה נדחתה'
    return { ok: false, error: msg, status: res.status, response: body }
  }

  return {
    ok: true,
    deviceId: creds.deviceId,
    outputNum,
    response: body,
  }
}
