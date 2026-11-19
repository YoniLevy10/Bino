/** Parse Grow invoiceNotifyUrl payloads (VAT invoice / auto receipt). */

export type GrowInvoiceWebhookFields = {
  publicToken: string | null
  processId: string | null
  transactionId: string | null
  invoiceId: string | null
  invoiceUrl: string | null
  /** Grow document kind when present (e.g. invoice / receipt / חשבונית מס). */
  documentType: string | null
  /** Top-level keys seen after flatten — forensics when matching fails. */
  payloadKeys: string[]
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

function pickStr(rec: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = rec[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

/**
 * Flatten Grow invoice callback the same way as payment webhooks:
 * root + data + customFields.
 */
export function flattenGrowInvoicePayload(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload) || {}
  const data = asRecord(root.data)
  const merged = data ? { ...root, ...data } : { ...root }
  const custom =
    asRecord(merged.customFields) ||
    asRecord(root.customFields) ||
    null
  if (custom) {
    for (const [k, v] of Object.entries(custom)) {
      if (merged[k] == null) merged[k] = v
    }
  }
  return merged
}

export function extractGrowInvoiceWebhookFields(payload: unknown): GrowInvoiceWebhookFields {
  const flattened = flattenGrowInvoicePayload(payload)
  return {
    publicToken: pickStr(flattened, ['cField1', 'CField1']),
    processId: pickStr(flattened, ['processId', 'paymentLinkProcessId']),
    transactionId: pickStr(flattened, [
      'transactionId',
      'transactionCode',
      'transaction_id',
      'transaction_code',
    ]),
    invoiceId: pickStr(flattened, [
      'invoiceNumber',
      'invoiceId',
      'documentId',
      'documentNumber',
      'invoice_id',
      'document_id',
      'asmachta',
    ]),
    invoiceUrl: pickStr(flattened, [
      'invoiceUrl',
      'invoice_url',
      'documentUrl',
      'document_url',
      'url',
    ]),
    documentType: pickStr(flattened, [
      'documentType',
      'document_type',
      'docType',
      'doc_type',
      'invoiceType',
      'invoice_type',
      'typeName',
      'type_name',
      'documentTypeName',
      'documentName',
      'docName',
      'type',
    ]),
    payloadKeys: Object.keys(flattened).sort(),
  }
}
