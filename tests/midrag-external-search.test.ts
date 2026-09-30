import { describe, expect, it } from 'vitest'
import {
  MIDRAG_AREAS,
  MIDRAG_SECTORS,
  midragCitiesForArea,
  midragHubCityForArea,
  midragSectorsForSelect,
  midragSectorById,
} from '@/lib/midrag/catalog'
import {
  buildMidragSearchUrl,
  buildMidragCityPickerUrl,
  buildMidragGoogleBackupUrl,
  externalSearchCaption,
  midragServiceMatchForSector,
  resolveMidragCity,
} from '@/lib/midrag/external-search'

describe('Midrag catalog snapshot', () => {
  it('includes the full Midrag sector list with serviceIds for almost all', () => {
    expect(MIDRAG_SECTORS.length).toBeGreaterThanOrEqual(140)
    const withService = MIDRAG_SECTORS.filter((s) => s.serviceId != null)
    expect(withService.length).toBeGreaterThanOrEqual(140)
    expect(midragSectorById(5)?.label).toContain('חשמל')
    expect(midragSectorById(5)?.serviceId).toBe(152)
  })

  it('pins building-maintenance trades before alphabetical rest', () => {
    const ordered = midragSectorsForSelect()
    expect(ordered[0]?.sectorId).toBe(5) // חשמלאים pinned first
    expect(ordered.map((s) => s.sectorId)).toContain(4)
    expect(ordered.map((s) => s.sectorId)).toContain(18)
  })

  it('groups cities into Midrag areas', () => {
    expect(MIDRAG_AREAS.length).toBeGreaterThanOrEqual(70)
    const haifa = MIDRAG_AREAS.find((a) => a.areaName.includes('חיפה'))
    expect(haifa).toBeTruthy()
    expect(haifa!.cities.some((c) => c.label === 'חיפה')).toBe(true)
    expect(midragCitiesForArea(haifa!.areaName).length).toBeGreaterThan(1)
    expect(midragHubCityForArea(haifa!.areaName)?.label).toBeTruthy()
  })
})

describe('buildMidragSearchUrl', () => {
  it('maps חשמלאים + חיפה cityId to Results', () => {
    const haifa = resolveMidragCity({ sectorId: 5, city: 'חיפה' })
    expect(haifa?.cityId).toBe(421)
    const url = buildMidragSearchUrl({
      sectorId: 5,
      cityId: haifa!.cityId,
    })
    expect(url).toContain('midrag.co.il/Search/Results')
    expect(url).toContain('serviceId=152')
    expect(url).toContain('cityId=421')
    expect(url).not.toContain('areaId=')
  })

  it('uses area hub city when only areaName is set', () => {
    const url = buildMidragSearchUrl({
      sectorId: 5,
      areaName: 'חיפה והסביבה',
    })
    expect(url).toContain('serviceId=152')
    expect(url).toContain('cityId=')
    expect(url).not.toContain('areaId=')
  })

  it('maps plumbing / hvac serviceIds from SectorPortal defaults', () => {
    expect(buildMidragSearchUrl({ sectorId: 4, city: 'חיפה' })).toContain(
      'serviceId=119'
    )
    expect(buildMidragSearchUrl({ sectorId: 18, city: 'חיפה' })).toContain(
      'serviceId=284'
    )
  })

  it('omits cityId when no location (no Tel Aviv default)', () => {
    const url = buildMidragSearchUrl({ sectorId: 5 })
    expect(url).toContain('serviceId=152')
    expect(url).not.toContain('cityId=')
  })

  it('falls back to InSector when no sector selected', () => {
    expect(buildMidragSearchUrl({ sectorId: null })).toContain('InSector')
  })

  it('falls back to SectorPortal when sector has no serviceId', () => {
    const missing = MIDRAG_SECTORS.find((s) => s.serviceId == null)
    expect(missing).toBeTruthy()
    expect(buildMidragSearchUrl({ sectorId: missing!.sectorId })).toContain(
      `SectorPortal/${missing!.sectorId}`
    )
  })
})

describe('buildMidragCityPickerUrl', () => {
  it('offers InCity when free-text city is set but unmapped', () => {
    const url = buildMidragCityPickerUrl({
      sectorId: 18,
      city: 'יישוב לא קיים בכלל',
    })
    expect(url).toContain('InCity')
    expect(url).toContain('serviceId=284')
  })

  it('returns null when city is already mapped', () => {
    expect(
      buildMidragCityPickerUrl({ sectorId: 18, city: 'חיפה' })
    ).toBeNull()
  })
})

describe('captions and google backup', () => {
  it('builds google backup and caption with trade + city', () => {
    expect(
      buildMidragGoogleBackupUrl({ sectorId: 18, city: 'נתניה' })
    ).toContain('google.com/search')
    expect(
      externalSearchCaption({ sectorId: 4, city: 'אשדוד' })
    ).toContain('אינסטלטור')
    expect(midragServiceMatchForSector(5)?.midragLabel).toContain('חשמל')
  })
})
