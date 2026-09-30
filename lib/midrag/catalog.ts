/**
 * Midrag catalog helpers — full ListSectors (149) + ListCities by areaName (77).
 * Data snapshotted from midrag.co.il (SectorPortal → serviceId).
 */
import sectorsJson from './catalog-sectors.json'
import areasJson from './catalog-areas.json'
import pinnedJson from './pinned-sector-ids.json'

export type MidragSector = {
  sectorId: number
  label: string
  /** Default Midrag Results serviceId from SectorPortal (null if unmapped) */
  serviceId: number | null
}

export type MidragCity = {
  cityId: number
  label: string
}

export type MidragArea = {
  areaName: string
  cities: MidragCity[]
}

export const MIDRAG_SECTORS: MidragSector[] = sectorsJson as MidragSector[]
export const MIDRAG_AREAS: MidragArea[] = areasJson as MidragArea[]
export const MIDRAG_PINNED_SECTOR_IDS: number[] = pinnedJson as number[]

const sectorById = new Map(MIDRAG_SECTORS.map((s) => [s.sectorId, s]))
const areaByName = new Map(MIDRAG_AREAS.map((a) => [a.areaName, a]))
const cityById = new Map<number, MidragCity & { areaName: string }>()
const cityByLabel = new Map<string, MidragCity & { areaName: string }>()

for (const area of MIDRAG_AREAS) {
  for (const city of area.cities) {
    const row = { ...city, areaName: area.areaName }
    cityById.set(city.cityId, row)
    cityByLabel.set(normalizeLabel(city.label), row)
  }
}

function normalizeLabel(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

function compactLabel(s: string): string {
  return normalizeLabel(s).replace(/[-\s]/g, '')
}

/** Sectors ordered for UI: building-maintenance pinned first, then A–Z Hebrew. */
export function midragSectorsForSelect(): MidragSector[] {
  const pinned = new Set(MIDRAG_PINNED_SECTOR_IDS)
  const head = MIDRAG_PINNED_SECTOR_IDS.map((id) => sectorById.get(id)).filter(
    (s): s is MidragSector => Boolean(s)
  )
  const rest = MIDRAG_SECTORS.filter((s) => !pinned.has(s.sectorId)).sort((a, b) =>
    a.label.localeCompare(b.label, 'he')
  )
  return [...head, ...rest]
}

export function midragSectorById(sectorId: number): MidragSector | null {
  return sectorById.get(sectorId) ?? null
}

export function midragAreaNames(): string[] {
  return MIDRAG_AREAS.map((a) => a.areaName).sort((a, b) => a.localeCompare(b, 'he'))
}

export function midragCitiesForArea(areaName: string | null | undefined): MidragCity[] {
  if (!areaName) return []
  return areaByName.get(areaName)?.cities ?? []
}

export function midragCityById(cityId: number): (MidragCity & { areaName: string }) | null {
  return cityById.get(cityId) ?? null
}

/** Resolve free-text / select city label to Midrag city + area. */
export function midragCityMatchForLabel(
  city: string | null | undefined
): (MidragCity & { areaName: string }) | null {
  const c = normalizeLabel(city ?? '')
  if (!c) return null
  const direct = cityByLabel.get(c)
  if (direct) return direct
  const compact = compactLabel(c)
  for (const [label, row] of cityByLabel) {
    if (compactLabel(label) === compact) return row
  }
  return null
}

/** Hub city for an area (first city Midrag lists for that areaName). */
export function midragHubCityForArea(areaName: string | null | undefined): MidragCity | null {
  const cities = midragCitiesForArea(areaName)
  return cities[0] ?? null
}

export function filterSectorsByQuery(
  query: string,
  sectors: MidragSector[] = midragSectorsForSelect()
): MidragSector[] {
  const q = query.trim().toLowerCase()
  if (!q) return sectors
  return sectors.filter((s) => s.label.toLowerCase().includes(q))
}

export function filterAreasByQuery(query: string): string[] {
  const q = query.trim().toLowerCase()
  const names = midragAreaNames()
  if (!q) return names
  return names.filter((a) => a.toLowerCase().includes(q))
}
