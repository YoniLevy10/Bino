import { normalizePhone } from '@/lib/sales-leads/phone'
import { normalizeWebsiteHost } from '@/lib/sales-leads/source-refs'
import type { SalesLeadSourceRecord } from '@/lib/sales-leads/types'

export function normalizeBusinessKey(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .trim()
    .toLowerCase()
    .replace(/["'`״׳]/g, '')
    .replace(/\s+/g, ' ')
}

export type DedupeCandidate = {
  phoneNormalized?: string | null
  sourceName?: string | null
  externalId?: string | null
  businessName?: string | null
  segmentSlug?: string | null
  city?: string | null
  websiteHost?: string | null
}

export type ExistingLeadLite = {
  id: string
  phoneNormalized: string | null
  sourceName: string
  externalId: string | null
  businessName: string | null
  segmentSlug: string
  city: string
  websiteHost?: string | null
}

export type DedupeMatch = {
  reason: 'phone' | 'website_domain' | 'source_external' | 'business_segment_city'
  existingId: string
}

export function findDuplicate(
  candidate: DedupeCandidate,
  existing: ExistingLeadLite[],
): DedupeMatch | null {
  const phone = candidate.phoneNormalized ?? null
  if (phone) {
    const hit = existing.find((e) => e.phoneNormalized && e.phoneNormalized === phone)
    if (hit) return { reason: 'phone', existingId: hit.id }
  }

  const host = candidate.websiteHost ?? null
  if (host) {
    const hit = existing.find((e) => e.websiteHost && e.websiteHost === host)
    if (hit) return { reason: 'website_domain', existingId: hit.id }
  }

  if (candidate.sourceName && candidate.externalId) {
    const hit = existing.find(
      (e) =>
        e.sourceName === candidate.sourceName &&
        e.externalId &&
        e.externalId === candidate.externalId,
    )
    if (hit) return { reason: 'source_external', existingId: hit.id }
  }

  const biz = normalizeBusinessKey(candidate.businessName)
  if (biz && candidate.segmentSlug && candidate.city) {
    const cityNorm = candidate.city.trim().toLowerCase()
    const hit = existing.find(
      (e) =>
        e.segmentSlug === candidate.segmentSlug &&
        e.city.trim().toLowerCase() === cityNorm &&
        normalizeBusinessKey(e.businessName) === biz,
    )
    if (hit) return { reason: 'business_segment_city', existingId: hit.id }
  }

  return null
}

export function candidateFromSourceRecord(record: SalesLeadSourceRecord): DedupeCandidate {
  return {
    phoneNormalized: normalizePhone(record.phone ?? record.whatsappPhone),
    sourceName: record.sourceName,
    externalId: record.externalId ?? null,
    businessName: record.businessName ?? record.name,
    segmentSlug: record.segmentSlug ?? null,
    city: record.city,
    websiteHost: normalizeWebsiteHost(record.websiteUrl ?? record.sourceUrl),
  }
}
