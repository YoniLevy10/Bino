/**
 * Resident-portal Midrag helpers — wraps catalog-based search (main API).
 * Deep links only; no booking API.
 */
import {
  MIDRAG_PINNED_SECTOR_IDS,
  midragSectorById,
  type MidragSector,
} from '@/lib/midrag/catalog'
import {
  buildMidragCityPickerUrl,
  buildMidragSearchUrl,
  midragCityMatchForCity,
} from '@/lib/midrag/external-search'

/** Building-maintenance sectors pinned for resident private-ticket UI. */
export function residentMidragSectors(): MidragSector[] {
  return MIDRAG_PINNED_SECTOR_IDS.map((id) => midragSectorById(id)).filter(
    (s): s is MidragSector => Boolean(s)
  )
}

export function parseSectorId(raw: unknown, fallback = 4): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

export function residentMidragSearchHref(opts: {
  sectorId: number | null
  city: string | null | undefined
}): { href: string | null; needsCityPicker: boolean; cityMapped: boolean } {
  const city = (opts.city ?? '').trim() || null
  const cityMapped = Boolean(midragCityMatchForCity(city))
  const input = { sectorId: opts.sectorId, city }
  if (cityMapped) {
    return {
      href: buildMidragSearchUrl(input),
      needsCityPicker: false,
      cityMapped: true,
    }
  }
  const picker = buildMidragCityPickerUrl(input)
  return {
    href: picker || 'https://www.midrag.co.il/',
    needsCityPicker: true,
    cityMapped: false,
  }
}
