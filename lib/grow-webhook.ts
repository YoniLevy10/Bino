/** Parse Grow payment-request server-to-server callbacks. */

export type GrowWebhookIds = {
  publicTokens: string[]
  paymentLinkIds: string[]
  transactionIds: string[]
  transactionToken: string | null
  transactionTypeId: string | null
  paymentType: string | null
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

function flattenGrowPayload(payload: unknown): Record<string, unknown> {
  const rec = asRecord(payload)
  if (!rec) return {}
  const nested = asRecord(rec.data)
  return nested ? { ...rec, ...nested } : rec
}

/** statusCode 2 = paid (Grow/Meshulam). */
export function isGrowPaidStatus(statusCode: unknown): boolean {
  return statusCode === 2 || statusCode === '2'
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

  return {
    publicTokens: [...new Set(publicTokens)],
    paymentLinkIds: [...new Set(paymentLinkIds)],
    transactionIds: [...new Set(transactionIds)],
    transactionToken: token,
    transactionTypeId,
    paymentType,
    paid: isGrowPaidStatus(rec.statusCode),
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
