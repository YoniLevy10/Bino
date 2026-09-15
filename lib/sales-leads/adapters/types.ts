import type { SalesLeadSourceRecord } from '@/lib/sales-leads/types'

export type AdapterProgressEvent = {
  done: number
  total: number
  kept: number
  label?: string
}

export type AdapterProgressCallback = (event: AdapterProgressEvent) => void | Promise<void>

export interface SalesLeadSourceAdapter {
  readonly name: string
  fetchRecords(input?: unknown): Promise<SalesLeadSourceRecord[]>
}

export function assertSourceRecord(
  record: SalesLeadSourceRecord,
): { ok: true } | { ok: false; error: string } {
  if (!record.name?.trim()) return { ok: false, error: 'name is required' }
  if (!record.city?.trim()) return { ok: false, error: 'city is required' }
  if (!record.sourceName?.trim()) return { ok: false, error: 'sourceName is required' }
  if (!record.phone?.trim() && !record.whatsappPhone?.trim() && !record.externalId) {
    return { ok: false, error: 'phone, whatsappPhone, or externalId is required' }
  }
  return { ok: true }
}
