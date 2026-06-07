import type { GreenInvoiceCredentials, GreenInvoiceEnv } from '@/lib/greeninvoice-config'

/** Row shape for Green Invoice fields on `clients` (server-side reads). */
export type ClientGreenInvoiceRow = {
  greeninvoice_enabled?: boolean | null
  greeninvoice_env?: string | null
  greeninvoice_api_key_id?: string | null
  greeninvoice_api_secret?: string | null
  greeninvoice_business_id?: string | null
  greeninvoice_clearing_plugin?: string | null
  greeninvoice_default_doc_type?: number | null
  greeninvoice_vat_type?: number | null
  greeninvoice_send_invoice_email?: boolean | null
  greeninvoice_remarks_template?: string | null
  greeninvoice_payment_success_url?: string | null
  greeninvoice_payment_failure_url?: string | null
}

export const CLIENT_GREENINVOICE_SELECT =
  'greeninvoice_enabled, greeninvoice_env, greeninvoice_api_key_id, greeninvoice_api_secret, greeninvoice_business_id, greeninvoice_clearing_plugin, greeninvoice_default_doc_type, greeninvoice_vat_type, greeninvoice_send_invoice_email, greeninvoice_remarks_template, greeninvoice_payment_success_url, greeninvoice_payment_failure_url'

/** Fields safe to load in browser settings (secret omitted from SELECT). */
export const CLIENT_GREENINVOICE_SETTINGS_SELECT =
  'greeninvoice_enabled, greeninvoice_env, greeninvoice_api_key_id, greeninvoice_business_id, greeninvoice_clearing_plugin, greeninvoice_default_doc_type, greeninvoice_vat_type, greeninvoice_send_invoice_email, greeninvoice_remarks_template, greeninvoice_payment_success_url, greeninvoice_payment_failure_url'

export function parseGreenInvoiceEnv(raw: string | null | undefined): GreenInvoiceEnv {
  return raw === 'sandbox' ? 'sandbox' : 'production'
}

export function credentialsFromClientRow(row: ClientGreenInvoiceRow): GreenInvoiceCredentials | null {
  const apiKeyId = row.greeninvoice_api_key_id?.trim()
  const apiSecret = row.greeninvoice_api_secret?.trim()
  if (!apiKeyId || !apiSecret) return null

  return {
    env: parseGreenInvoiceEnv(row.greeninvoice_env),
    apiKeyId,
    apiSecret,
    businessId: row.greeninvoice_business_id?.trim() || null,
  }
}

export function isGreenInvoiceConfigured(row: ClientGreenInvoiceRow): boolean {
  return Boolean(
    row.greeninvoice_enabled &&
      row.greeninvoice_api_key_id?.trim() &&
      row.greeninvoice_api_secret?.trim()
  )
}
