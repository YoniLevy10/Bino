/**
 * Parse Morning (Green Invoice) webhook payloads into ids we can match
 * against collection_charges.greeninvoice_payment_id / greeninvoice_document_id.
 */

export type GreenInvoiceWebhookIds = {
  paymentIds: string[]
  documentIds: string[]
}

function pushId(v: unknown, into: string[]) {
  if (typeof v === 'string' && v.trim()) into.push(v.trim())
}

function isDocumentEvent(obj: Record<string, unknown>): boolean {
  return typeof obj.type === 'number' || typeof obj.number === 'number'
}

/** Extract payment / document ids from a Morning webhook JSON object. */
export function extractGreenInvoiceWebhookIds(payload: unknown): GreenInvoiceWebhookIds {
  const paymentIds: string[] = []
  const documentIds: string[] = []

  if (!payload || typeof payload !== 'object') return { paymentIds, documentIds }
  const obj = payload as Record<string, unknown>

  if (isDocumentEvent(obj)) {
    // document/created — top-level id is the document id (not a payment form id)
    pushId(obj.id, documentIds)
    pushId(obj.documentId, documentIds)
    if (Array.isArray(obj.transactions)) {
      for (const tx of obj.transactions) {
        if (tx && typeof tx === 'object') {
          pushId((tx as { id?: unknown }).id, paymentIds)
        }
      }
    }
  } else {
    // payment/receive (and similar)
    pushId(obj.id, paymentIds)
    pushId(obj.paymentId, paymentIds)
    pushId(obj.documentId, documentIds)
    if (Array.isArray(obj.transactions)) {
      for (const tx of obj.transactions) {
        if (tx && typeof tx === 'object') {
          pushId((tx as { id?: unknown }).id, paymentIds)
        }
      }
    }
  }

  if (obj.data && typeof obj.data === 'object') {
    const nested = extractGreenInvoiceWebhookIds(obj.data)
    paymentIds.push(...nested.paymentIds)
    documentIds.push(...nested.documentIds)
  }

  return {
    paymentIds: [...new Set(paymentIds)],
    documentIds: [...new Set(documentIds)],
  }
}

/** Authorize Morning webhook via shared secret query/header token. */
export function authorizeGreenInvoiceWebhook(opts: {
  expectedSecret: string | null | undefined
  tokenFromQuery: string | null | undefined
  tokenFromHeader: string | null | undefined
}): boolean {
  const expected = (opts.expectedSecret || '').trim()
  if (!expected) return true
  const token = (opts.tokenFromQuery || opts.tokenFromHeader || '').trim()
  return token === expected
}
