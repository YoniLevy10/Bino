import { describe, expect, it } from 'vitest'
import {
  MIDRAG_TRADE_CATEGORIES,
  buildMidragSearchUrl,
  buildMidragCityPickerUrl,
  buildMidragGoogleBackupUrl,
  externalSearchCaption,
  midragCityMatchForCity,
  midragServiceMatchForCategory,
  normalizeMidragTradeCategory,
} from '@/lib/midrag/external-search'

describe('buildMidragSearchUrl', () => {
  it('maps HVAC + Tel Aviv to Results with general AC serviceId and cityId', () => {
    const url = buildMidragSearchUrl({ category: 'hvac', city: 'תל אביב' })
    expect(url).toContain('midrag.co.il/Search/Results')
    expect(url).toContain('serviceId=284')
    expect(url).toContain('cityId=1243')
    expect(url).not.toContain('areaId=')
  })

  it('maps Haifa / Jerusalem / Netanya to distinct cityIds (not Tel Aviv)', () => {
    expect(buildMidragSearchUrl({ category: 'hvac', city: 'חיפה' })).toContain(
      'cityId=421'
    )
    expect(
      buildMidragSearchUrl({ category: 'electrical', city: 'ירושלים' })
    ).toContain('cityId=515')
    expect(
      buildMidragSearchUrl({ category: 'plumbing', city: 'נתניה' })
    ).toContain('cityId=900')
  })

  it('uses general trade serviceIds (not narrow sub-services)', () => {
    expect(buildMidragSearchUrl({ category: 'plumbing', city: 'חיפה' })).toContain(
      'serviceId=119'
    )
    expect(
      buildMidragSearchUrl({ category: 'electrical', city: 'חיפה' })
    ).toContain('serviceId=152')
    expect(buildMidragSearchUrl({ category: 'cleaning', city: 'חיפה' })).toContain(
      'serviceId=1249'
    )
    expect(
      buildMidragSearchUrl({ category: 'security', city: 'חיפה' })
    ).toContain('serviceId=509')
  })

  it('omits cityId when city unknown (no Tel Aviv default)', () => {
    const url = buildMidragSearchUrl({ category: 'electrical' })
    expect(url).toContain('serviceId=152')
    expect(url).not.toContain('cityId=')
    expect(url).not.toContain('areaId=')
  })

  it('falls back to InSector for unknown category', () => {
    expect(buildMidragSearchUrl({ category: 'other' })).toContain('InSector')
  })

  it('resolves city aliases (פרדס חנה, יקנעם)', () => {
    expect(
      buildMidragSearchUrl({ category: 'hvac', city: 'פרדס חנה' })
    ).toContain('cityId=1027')
    expect(buildMidragSearchUrl({ category: 'hvac', city: 'יקנעם' })).toContain(
      'cityId=510'
    )
  })
})

describe('buildMidragCityPickerUrl', () => {
  it('offers InCity when city is set but unmapped', () => {
    const url = buildMidragCityPickerUrl({
      category: 'hvac',
      city: 'יישוב לא קיים',
    })
    expect(url).toContain('InCity')
    expect(url).toContain('serviceId=284')
  })

  it('returns null when city is already mapped', () => {
    expect(
      buildMidragCityPickerUrl({ category: 'hvac', city: 'חיפה' })
    ).toBeNull()
  })
})

describe('midragServiceMatchForCategory', () => {
  it('maps every BINO trade category except other', () => {
    for (const cat of MIDRAG_TRADE_CATEGORIES) {
      if (cat === 'other') {
        expect(midragServiceMatchForCategory(cat)).toBeNull()
      } else {
        expect(midragServiceMatchForCategory(cat)?.serviceId).toBeGreaterThan(0)
      }
    }
  })

  it('exposes Midrag labels for UI', () => {
    expect(midragServiceMatchForCategory('hvac')?.midragLabel).toBe('תיקון מזגן')
    expect(midragServiceMatchForCategory('plumbing')?.midragLabel).toBe(
      'אינסטלציה'
    )
  })
})

describe('midragCityMatchForCity', () => {
  it('resolves common cities', () => {
    expect(midragCityMatchForCity('תל אביב')?.cityId).toBe(1243)
    expect(midragCityMatchForCity('חיפה')?.cityId).toBe(421)
    expect(midragCityMatchForCity('')).toBeNull()
  })

  it('builds google backup and caption with Midrag trade + city labels', () => {
    expect(buildMidragGoogleBackupUrl({ category: 'hvac', city: 'נתניה' })).toContain(
      'google.com/search'
    )
    expect(externalSearchCaption({ category: 'plumbing', city: 'אשדוד' })).toBe(
      'מידרג · אינסטלציה · אשדוד'
    )
    expect(externalSearchCaption({ category: 'hvac', city: 'פרדס חנה' })).toContain(
      'פרדס חנה-כרכור'
    )
  })
})

describe('normalizeMidragTradeCategory', () => {
  it('keeps known trades and falls back to other', () => {
    expect(normalizeMidragTradeCategory('electrical')).toBe('electrical')
    expect(normalizeMidragTradeCategory('UNKNOWN')).toBe('other')
    expect(normalizeMidragTradeCategory(null)).toBe('other')
  })
})
