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
  draft: 'טיוטה',
  sent: 'נשלח לתשלום',
  paid: 'שולם',
  failed: 'נכשל',
  cancelled: 'בוטל',
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
