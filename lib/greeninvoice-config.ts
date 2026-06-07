/** Morning (Green Invoice) API configuration — shared types and constants. */

export type GreenInvoiceEnv = 'sandbox' | 'production'

export type GreenInvoiceClearingPlugin = 'cardcom' | 'isracard' | 'grow'

export const GREENINVOICE_BASE_URLS: Record<GreenInvoiceEnv, string> = {
  sandbox: 'https://sandbox.d.greeninvoice.co.il/api/v1',
  production: 'https://api.greeninvoice.co.il/api/v1',
}

/** Document types used for collections (see Morning API /documents/types). */
export const GREENINVOICE_DOC_TYPES = {
  proforma: 300,
  taxInvoice: 305,
  taxInvoiceReceipt: 320,
} as const

export type GreenInvoiceDocType =
  (typeof GREENINVOICE_DOC_TYPES)[keyof typeof GREENINVOICE_DOC_TYPES]

/** VAT declaration on documents: 0=before VAT, 1=included, 2=exempt */
export const GREENINVOICE_VAT_TYPES = {
  beforeVat: 0,
  vatIncluded: 1,
  vatExempt: 2,
} as const

export type GreenInvoiceVatType =
  (typeof GREENINVOICE_VAT_TYPES)[keyof typeof GREENINVOICE_VAT_TYPES]

export const GREENINVOICE_DOC_TYPE_LABELS: Record<number, string> = {
  300: 'חשבון עסקה (300)',
  305: 'חשבונית מס (305)',
  320: 'חשבונית מס + קבלה (320)',
}

export const GREENINVOICE_VAT_TYPE_LABELS: Record<number, string> = {
  0: 'לפני מע"מ (ברירת מחדל)',
  1: 'כולל מע"מ',
  2: 'פטור ממע"מ',
}

export const GREENINVOICE_CLEARING_LABELS: Record<GreenInvoiceClearingPlugin, string> = {
  cardcom: 'Cardcom (טרמינל E-COMMERCE)',
  isracard: 'Isracard',
  grow: 'Digital Payments (Grow)',
}

export type GreenInvoiceCredentials = {
  env: GreenInvoiceEnv
  apiKeyId: string
  apiSecret: string
  businessId?: string | null
}

export type GreenInvoiceBusinessSummary = {
  id: string
  name: string
}

export type GreenInvoiceTokenResponse = {
  token: string
  expires: number
}

export type GreenInvoiceApiError = {
  errorCode?: number
  errorMessage?: string
}
