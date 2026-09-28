/** Parse Grow payment-request server-to-server callbacks. */

export type GrowWebhookIds = {
  publicTokens: string[]
  paymentLinkIds: string[]
  transactionIds: string[]
  transactionToken: string | null
  transactionTypeId: string | null
  paymentType: string | null
  /** Grow `data.sum` when present — compare to charge amount before marking paid. */
  sum: string | null
  paid: boolean
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

function pushStr(value: unknown, into: string[]) {
  if (value == null) return
  const s = String(value).trim()
  if (s) into.push(s)
}

/**
 * Grow S2S callbacks are often `application/x-www-form-urlencoded` with
 * bracket keys like `data[customFields][cField1]` (verified via updateMyUrl → httpbin).
 * Expand those into nested objects before field extraction.
 */
export function expandBracketFormKeys(
  flat: Record<string, string>
): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const [rawKey, rawValue] of Object.entries(flat)) {
    const key = rawKey.trim()
    if (!key) continue
    const path: string[] = []
    const re = /([^\[\]]+)|\[([^\]]*)\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(key))) {
      const part = m[1] ?? m[2]
      if (part !== undefined && part !== '') path.push(part)
    }
    if (path.length === 0) continue
    let cursor: Record<string, unknown> = root
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i]
      const next = cursor[seg]
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        cursor[seg] = {}
      }
      cursor = cursor[seg] as Record<string, unknown>
    }
    cursor[path[path.length - 1]] = rawValue
  }
  return root
}

function flattenGrowPayload(payload: unknown): Record<string, unknown> {
  const rec = asRecord(payload)
  if (!rec) return {}
  // Already-nested JSON (docs example) or expanded bracket form.
  const nested = asRecord(rec.data)
  const base = nested ? { ...rec, ...nested } : { ...rec }
  // customFields may hold cField1 (docs + updateMyUrl).
  const custom = asRecord(base.customFields)
  if (custom) {
    for (const [k, v] of Object.entries(custom)) {
      if (base[k] == null) base[k] = v
    }
  }
  return base
}

/** statusCode 2 = paid (Grow/Meshulam). Hebrew status is a secondary signal. */
export function isGrowPaidStatus(statusCode: unknown, statusText?: unknown): boolean {
  if (statusCode === 2 || statusCode === '2') return true
  if (typeof statusText === 'string' && statusText.trim() === 'שולם') return true
  return false
}

export function extractGrowWebhookIds(payload: unknown): GrowWebhookIds {
  const rec = flattenGrowPayload(payload)
  const publicTokens: string[] = []
  const paymentLinkIds: string[] = []
  const transactionIds: string[] = []

  pushStr(rec.cField1, publicTokens)
  pushStr(rec.CField1, publicTokens)
  if (Array.isArray(rec.customField)) {
    for (const field of rec.customField) {
      if (field && typeof field === 'object') {
        const f = field as { key?: unknown; value?: unknown; name?: unknown }
        const key = String(f.key || f.name || '')
        if (key.toLowerCase().includes('cfield1') || key === '1') pushStr(f.value, publicTokens)
      }
    }
  }

  pushStr(rec.paymentLinkProcessId, paymentLinkIds)
  pushStr(rec.processId, paymentLinkIds)
  pushStr(rec.transactionId, transactionIds)

  const token = rec.transactionToken == null ? null : String(rec.transactionToken)
  const transactionTypeId = rec.transactionTypeId == null ? null : String(rec.transactionTypeId)
  const paymentType = rec.paymentType == null ? null : String(rec.paymentType)
  const sum = rec.sum == null || rec.sum === '' ? null : String(rec.sum).trim()

  return {
    publicTokens: [...new Set(publicTokens)],
    paymentLinkIds: [...new Set(paymentLinkIds)],
    transactionIds: [...new Set(transactionIds)],
    transactionToken: token,
    transactionTypeId,
    paymentType,
    sum,
    paid: isGrowPaidStatus(rec.statusCode, rec.status),
  }
}

export function authorizeGrowWebhook(opts: {
  expectedSecret: string | null | undefined
  tokenFromQuery: string | null | undefined
  tokenFromHeader: string | null | undefined
}): boolean {
  const expected = (opts.expectedSecret || '').trim()
  if (!expected) return false
  const token = (opts.tokenFromQuery || opts.tokenFromHeader || '').trim()
  return Boolean(token) && token === expected
}

/** True when callback sum matches charge amount (ILS). Missing sum → skip check. */
export function growCallbackSumMatchesCharge(
  callbackSum: string | null | undefined,
  chargeAmount: number | string | null | undefined
): boolean {
  if (callbackSum == null || String(callbackSum).trim() === '') return true
  const a = Number(String(callbackSum).replace(/,/g, ''))
  const b = Number(chargeAmount)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) < 0.009
}
