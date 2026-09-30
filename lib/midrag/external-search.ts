/**
 * Midrag (מידרג) external professional search for BINO.
 * Opens in a new tab — not an iframe (X-Frame / product stance).
 *
 * Results deep links use **serviceId + cityId** (not areaId alone —
 * areaId is imprecise on Midrag). Categories/areas come from the full
 * Midrag catalog snapshot in `./catalog`.
 */

import {
  midragCityById,
  midragCityMatchForLabel,
  midragHubCityForArea,
  midragSectorById,
  type MidragCity,
  type MidragSector,
} from './catalog'

export type ExternalSearchInput = {
  /** Midrag ListSectors value */
  sectorId: number | null
  /** Midrag ListCities areaName (region) */
  areaName?: string | null
  /** Midrag cityId — preferred location filter */
  cityId?: number | null
  /** Free-text city fallback (legacy / aliases) */
  city?: string | null
}

export type MidragCityMatch = MidragCity & {
  areaName: string
}

export type MidragServiceMatch = {
  serviceId: number
  midragLabel: string
  sectorId: number
}

const MIDRAG_RESULTS = 'https://www.midrag.co.il/Search/Results'
const MIDRAG_IN_SECTOR = 'https://www.midrag.co.il/Search/InSector'
const MIDRAG_IN_CITY = 'https://www.midrag.co.il/Search/InCity'
const MIDRAG_SECTOR_PORTAL = 'https://www.midrag.co.il/Content/SectorPortal'

function normalizeCity(city: string | null | undefined): string {
  return (city ?? '').trim().replace(/\s+/g, ' ')
}

export function midragServiceMatchForSector(
  sectorId: number | null | undefined
): MidragServiceMatch | null {
  if (sectorId == null || !Number.isFinite(sectorId)) return null
  const sector = midragSectorById(sectorId)
  if (!sector?.serviceId) return null
  return {
    serviceId: sector.serviceId,
    midragLabel: sector.label,
    sectorId: sector.sectorId,
  }
}

export function resolveMidragCity(input: ExternalSearchInput): MidragCityMatch | null {
  if (input.cityId != null && Number.isFinite(input.cityId)) {
    const byId = midragCityById(input.cityId)
    if (byId) return byId
  }
  const byLabel = midragCityMatchForLabel(input.city)
  if (byLabel) return byLabel
  // Area without explicit city → hub city for that region
  if (input.areaName) {
    const hub = midragHubCityForArea(input.areaName)
    if (hub) {
      return { ...hub, areaName: input.areaName }
    }
  }
  return null
}

export function midragSectorLabel(sectorId: number | null | undefined): string {
  if (sectorId == null) return 'בחירת מקצוע'
  return midragSectorById(sectorId)?.label ?? 'בחירת מקצוע'
}

/**
 * Primary Midrag deep link.
 * Prefer Results with serviceId + cityId; never invent Tel Aviv.
 */
export function buildMidragSearchUrl(input: ExternalSearchInput): string {
  const service = midragServiceMatchForSector(input.sectorId)
  const cityMatch = resolveMidragCity(input)

  if (service) {
    if (cityMatch) {
      return `${MIDRAG_RESULTS}?serviceId=${service.serviceId}&cityId=${cityMatch.cityId}`
    }
    return `${MIDRAG_RESULTS}?serviceId=${service.serviceId}`
  }

  // Sector known but no serviceId mapping → SectorPortal (still on Midrag)
  if (input.sectorId != null) {
    return `${MIDRAG_SECTOR_PORTAL}/${input.sectorId}`
  }

  return MIDRAG_IN_SECTOR
}

/** When a free-text city is set but unmapped, offer Midrag city picker. */
export function buildMidragCityPickerUrl(input: ExternalSearchInput): string | null {
  const service = midragServiceMatchForSector(input.sectorId)
  if (!service) return null
  if (resolveMidragCity(input)) return null
  if (!normalizeCity(input.city) && !input.areaName) return null
  return `${MIDRAG_IN_CITY}?serviceId=${service.serviceId}`
}

/** Google query biased to Midrag — backup when Midrag Results are too broad. */
export function buildMidragGoogleBackupUrl(input: ExternalSearchInput): string {
  const trade = midragSectorLabel(input.sectorId)
  const cityMatch = resolveMidragCity(input)
  const city =
    cityMatch?.label ||
    normalizeCity(input.city) ||
    (input.areaName ? String(input.areaName) : '')
  const q = ['מידרג', trade, city].filter(Boolean).join(' ')
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

export function externalSearchCaption(input: ExternalSearchInput): string {
  const service = midragServiceMatchForSector(input.sectorId)
  const trade = service?.midragLabel ?? midragSectorLabel(input.sectorId)
  const cityMatch = resolveMidragCity(input)
  const area = input.areaName?.trim() || null

  if (!service && input.sectorId == null) {
    return area ? `מידרג · בחירת מקצוע · ${area}` : 'מידרג · בחירת מקצוע'
  }

  if (!service) {
    return cityMatch
      ? `מידרג · ${trade} · ${cityMatch.label}`
      : area
        ? `מידרג · ${trade} · ${area}`
        : `מידרג · ${trade}`
  }

  if (cityMatch) {
    const region =
      area && area !== cityMatch.areaName
        ? `${area} · ${cityMatch.label}`
        : cityMatch.areaName && cityMatch.areaName !== cityMatch.label
          ? `${cityMatch.label} (${cityMatch.areaName})`
          : cityMatch.label
    return `מידרג · ${trade} · ${region}`
  }

  if (area) return `מידרג · ${trade} · ${area} (בחירת עיר)`
  return `מידרג · ${trade} · ללא אזור`
}

/** @deprecated Prefer midragServiceMatchForSector — kept for older call sites. */
export function midragServiceMatchForCategory(
  category: string
): MidragServiceMatch | null {
  const n = Number(category)
  if (Number.isFinite(n)) return midragServiceMatchForSector(n)
  return null
}

/** @deprecated Prefer resolveMidragCity / midragCityMatchForLabel. */
export function midragCityMatchForCity(
  city: string | null | undefined
): { cityId: number; midragLabel: string } | null {
  const m = midragCityMatchForLabel(city)
  if (!m) return null
  return { cityId: m.cityId, midragLabel: m.label }
}

export type { MidragSector, MidragCity }
