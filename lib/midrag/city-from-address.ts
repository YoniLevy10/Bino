import { MIDRAG_AREAS, midragCityMatchForLabel } from './catalog'

/**
 * Extract a Midrag-known city from a free-text building address.
 * Only returns a city when a catalog label appears in the address.
 * Does NOT guess Tel Aviv or any default.
 */
export function cityFromProjectAddress(address: string | null | undefined): {
  cityId: number
  label: string
  areaName: string
} | null {
  const text = (address || '').trim()
  if (!text) return null

  const segments = [text, ...text.split(/[,،]/).map((s) => s.trim())].filter(Boolean)
  const words = text.split(/\s+/).filter(Boolean)
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    segments.push(words.slice(-n).join(' '))
  }

  for (const seg of segments) {
    const match = midragCityMatchForLabel(seg)
    if (match) {
      return { cityId: match.cityId, label: match.label, areaName: match.areaName }
    }
  }

  const cities: Array<{ cityId: number; label: string; areaName: string }> = []
  for (const area of MIDRAG_AREAS) {
    for (const city of area.cities) {
      cities.push({ cityId: city.cityId, label: city.label, areaName: area.areaName })
    }
  }
  cities.sort((a, b) => b.label.length - a.label.length)
  for (const city of cities) {
    if (city.label.length < 3) continue
    // Avoid matching Hebrew street word "רחוב" / similar when it is the address prefix
    const idx = text.indexOf(city.label)
    if (idx === -1) continue
    if (idx === 0 && text.length > city.label.length) continue
    const before = idx === 0 ? '' : text[idx - 1]
    const afterIdx = idx + city.label.length
    const after = afterIdx >= text.length ? '' : text[afterIdx]
    const boundaryBefore = idx === 0 || /[\s,،\-–]/.test(before)
    const boundaryAfter = afterIdx >= text.length || /[\s,،\-–0-9]/.test(after)
    if (boundaryBefore && boundaryAfter) {
      return city
    }
  }

  return null
}
