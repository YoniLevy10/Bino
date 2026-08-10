/** Collection charge statuses — גביית ועד via Morning. */

export const COLLECTION_CHARGE_STATUSES = [
  'draft',
  'sent',
  'paid',
  'failed',
  'cancelled',
] as const

export type CollectionChargeStatus = (typeof COLLECTION_CHARGE_STATUSES)[number]

export const COLLECTION_CHARGE_STATUS_LABELS: Record<CollectionChargeStatus, string> = {
  draft: 'בתהליך',
  sent: 'נשלח והועבר',
  paid: 'שולם',
  failed: 'חריג',
  cancelled: 'בוטל',
}

export const COLLECTION_CHARGE_STATUS_COLORS: Record<CollectionChargeStatus, string> = {
  draft: '#FF9500',
  sent: '#0066FF',
  paid: '#34C759',
  failed: '#FF3B30',
  cancelled: '#86868B',
}

export type CollectionChargeRow = {
  id: string
  client_id: string
  project_id: string | null
  resident_id: string | null
  title: string
  description: string | null
  amount: number
  currency: string
  status: CollectionChargeStatus
  public_token: string
  batch_id: string | null
  period_label: string | null
  greeninvoice_client_id: string | null
  greeninvoice_document_id: string | null
  greeninvoice_document_number: number | null
  greeninvoice_payment_url: string | null
  greeninvoice_payment_id: string | null
  sent_at: string | null
  paid_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const COLLECTION_CHARGE_LIST_SELECT = `
  id, client_id, project_id, resident_id, title, description, amount, currency, status,
  public_token, batch_id, period_label,
  greeninvoice_client_id, greeninvoice_document_id, greeninvoice_document_number,
  greeninvoice_payment_url, greeninvoice_payment_id,
  sent_at, paid_at, created_by, created_at, updated_at,
  residents ( id, full_name, phone, apartment_number, normalized_phone ),
  projects ( id, name )
`.replace(/\s+/g, ' ').trim()

export type CollectionChargeListItem = CollectionChargeRow & {
  residents?: {
    id: string
    full_name: string
    phone: string | null
    apartment_number: string | null
    normalized_phone: string | null
  } | null
  projects?: {
    id: string
    name: string
  } | null
}

export function isCollectionChargeStatus(v: unknown): v is CollectionChargeStatus {
  return typeof v === 'string' && (COLLECTION_CHARGE_STATUSES as readonly string[]).includes(v)
}

export function formatChargeAmountIls(amount: number): string {
  return `₪${Number(amount).toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

export function buildPaymentSmsBody(opts: {
  residentName: string
  title: string
  amount: number
  payUrl: string
}): string {
  const name = opts.residentName.trim() || 'דייר/ת'
  const title = opts.title.trim() || 'חיוב'
  return [
    `שלום ${name},`,
    `לתשלום: ${title} בסך ${formatChargeAmountIls(opts.amount)}.`,
    `לתשלום מאובטח: ${opts.payUrl}`,
  ].join('\n')
}
