/**
 * Direct iCount API client for resident collections (VaadPay).
 * P0 scaffold: createPayLink is intentionally unimplemented until credentials
 * + paypage contract are verified against a real sandbox/pilot charge.
 *
 * Docs: https://apiv3.icount.co.il/ — modules paypage / hk_api / webhook / doc
 */

import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { ICOUNT_API_BASE, isIcountCollectionsPlatformEnabled } from '@/lib/icount-config'
import type { IcountCredentials } from '@/lib/icount-credentials'

const ICOUNT_TIMEOUT_MS = 20_000

export type IcountPayLinkRequest = {
  amount: number
  description: string
  fullName: string
  phone?: string | null
  email?: string | null
  /** Bino public_token — correlate IPN */
  publicToken: string
  successUrl: string
  cancelUrl?: string | null
  ipnUrl: string
}

export type IcountPayLinkResult =
  | {
      ok: true
      url: string
      saleId: string | null
    }
  | { ok: false; error: string; code?: string }

export async function postIcountJson(
  path: string,
  creds: IcountCredentials,
  body: Record<string, unknown>
): Promise<{ status: number; data: unknown } | { status: 0; data: null }> {
  const res = await fetchWithTimeout(
    `${ICOUNT_API_BASE}/${path.replace(/^\//, '')}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiToken}`,
      },
      body: JSON.stringify({
        cid: creds.cid,
        ...body,
      }),
    },
    ICOUNT_TIMEOUT_MS
  )
  if (!res) return { status: 0, data: null }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data }
}

/**
 * Create a hosted pay-now session. Scaffold returns not_implemented until
 * owner confirms paypage API shape (hk_api/create_sale vs paypage module).
 */
export async function createIcountPayLink(
  creds: IcountCredentials,
  _req: IcountPayLinkRequest
): Promise<IcountPayLinkResult> {
  if (!isIcountCollectionsPlatformEnabled()) {
    return {
      ok: false,
      error: 'גביית iCount כבויה בשרת (ICOUNT_COLLECTIONS_ENABLED).',
      code: 'ICOUNT_PLATFORM_OFF',
    }
  }
  if (!creds.paypageId.trim()) {
    return {
      ok: false,
      error: 'חסר paypage_id.',
      code: 'ICOUNT_PAYPAGE_MISSING',
    }
  }
  // Intentionally not calling iCount yet — avoid accidental live docs/charges.
  return {
    ok: false,
    error:
      'יצירת קישור iCount עדיין ב־scaffold. אשרו חוזה API (paypage / hk_api) ואז חברו createIcountPayLink.',
    code: 'ICOUNT_CREATE_NOT_IMPLEMENTED',
  }
}
