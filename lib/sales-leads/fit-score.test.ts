import { describe, expect, it } from 'vitest'
import {
  assessBuyerFit,
  shouldKeepDiscoveredLead,
  fitClassLabelHe,
} from '@/lib/sales-leads/fit-score'

describe('assessBuyerFit — suitable', () => {
  it('scores Hebrew building management companies as suitable', () => {
    const a = assessBuyerFit({
      name: 'חברת ניהול ואחזקת בניינים אלון בע״מ',
      phone: '03-5551234',
      websiteUrl: 'https://alon-mgmt.co.il',
      address: 'תל אביב',
      segmentSlug: 'building_mgmt',
    })
    expect(a.fitClass).toBe('suitable')
    expect(a.score).toBeGreaterThanOrEqual(60)
    expect(a.confidence).toBeGreaterThanOrEqual(40)
    // "בניינים" → ~12 buildings × ₪100 MRR heuristic
    expect(a.estimatedMrrIls).toBe(1200)
    expect(a.reasons).toContain('org_buyer_signal')
    expect(a.reasons).toContain('multi_site_signal')
  })

  it('keeps property managers via shouldKeepDiscoveredLead', () => {
    expect(
      shouldKeepDiscoveredLead({
        name: 'ניהול נכסים מטרו',
        phone: '052-9876543',
        websiteUrl: 'https://metro-pm.co.il',
        segmentSlug: 'property_mgmt',
      }),
    ).toBe(true)
  })
})

describe('assessBuyerFit — unsuitable (solo trade / retail)', () => {
  it('rejects Hebrew solo trades (Fixly ICP, not BINO buyers)', () => {
    const a = assessBuyerFit({
      name: 'אינסטלטור דוד כהן',
      phone: '050-1234567',
      segmentSlug: 'building_mgmt',
    })
    expect(a.fitClass).toBe('unsuitable')
    expect(a.reasons).toContain('solo_trade_not_platform_buyer')
    expect(a.estimatedMrrIls).toBeNull()
    expect(shouldKeepDiscoveredLead({ name: 'אינסטלטור דוד כהן', phone: '0501234567' })).toBe(
      false,
    )
  })

  it('rejects retail / hardware shops', () => {
    const a = assessBuyerFit({
      name: 'חנות חומרי בניין שמעון',
      phone: '03-2222222',
    })
    expect(a.fitClass).toBe('unsuitable')
    expect(a.reasons).toContain('retail_not_platform_buyer')
  })

  it('rejects placeTypes that look like stores', () => {
    const a = assessBuyerFit({
      name: 'שמעון ציוד',
      placeTypes: ['hardware_store'],
      phone: '03-1111111',
    })
    expect(a.fitClass).toBe('unsuitable')
    expect(a.reasons).toContain('retail_not_platform_buyer')
  })
})


describe('assessBuyerFit — needs_review', () => {
  it('marks weak-org leads with phone+website as needs_review', () => {
    const a = assessBuyerFit({
      name: 'Some Random Co',
      phone: '03-5551234',
      websiteUrl: 'https://example.co.il',
    })
    expect(a.fitClass).toBe('needs_review')
    expect(a.reasons).toContain('org_signal_weak')
    expect(a.score).toBeLessThan(60)
  })

  it('still keeps needs_review leads when name is present', () => {
    expect(
      shouldKeepDiscoveredLead({
        name: 'Some Random Co',
        phone: '03-5551234',
        websiteUrl: 'https://example.co.il',
      }),
    ).toBe(true)
  })
})

describe('assessBuyerFit — English name edge cases', () => {
  it('accepts English building / property management names', () => {
    const a = assessBuyerFit({
      name: 'Building Management Group Ltd',
      phone: '03-5551234',
      websiteUrl: 'https://bmg.example.com',
      address: 'Tel Aviv',
      segmentSlug: 'building_mgmt',
    })
    expect(a.fitClass).toBe('suitable')
    expect(a.reasons).toContain('org_buyer_signal')
  })

  it('accepts English facility / LLC buyers', () => {
    const a = assessBuyerFit({
      name: 'Facility Services LLC',
      phone: '03-5551234',
      websiteUrl: 'https://fs.example.com',
      segmentSlug: 'facility_mgmt',
    })
    expect(a.fitClass).toBe('suitable')
    // facility_mgmt default building estimate × ₪100
    expect(a.estimatedMrrIls).toBe(2000)
  })

  it('rejects English solo trades (plumber / handyman)', () => {
    const a = assessBuyerFit({
      name: 'John the Plumber',
      phone: '050-1234567',
    })
    expect(a.fitClass).toBe('unsuitable')
    expect(a.reasons).toContain('solo_trade_not_platform_buyer')
  })

  it('rejects English retail outlet / showroom names', () => {
    const a = assessBuyerFit({
      name: 'Hardware Outlet Showroom',
      phone: '03-1111111',
      placeTypes: ['hardware_store'],
    })
    expect(a.fitClass).toBe('unsuitable')
    expect(a.reasons).toContain('retail_not_platform_buyer')
  })
})

describe('fitClassLabelHe', () => {
  it('returns Hebrew labels', () => {
    expect(fitClassLabelHe('suitable')).toBe('מתאים')
    expect(fitClassLabelHe('needs_review')).toBe('לבדיקה')
    expect(fitClassLabelHe('unsuitable')).toBe('לא מתאים')
    expect(fitClassLabelHe('unknown')).toBe('לא ידוע')
  })
})
