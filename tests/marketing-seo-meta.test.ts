import { describe, expect, it, afterEach, vi } from 'vitest'
import {
  BINO_MARKETING_DESCRIPTION,
  BINO_MARKETING_DESCRIPTION_EN,
  BINO_MARKETING_TITLE,
  BINO_MARKETING_TITLE_EN,
} from '@/lib/marketing-site'
import { MARKETING_COPY } from '@/lib/marketing-copy'

describe('marketing SEO meta lengths', () => {
  it('keeps HE/EN titles in the 50–60 SERP band', () => {
    expect(BINO_MARKETING_TITLE.length).toBeGreaterThanOrEqual(50)
    expect(BINO_MARKETING_TITLE.length).toBeLessThanOrEqual(60)
    expect(BINO_MARKETING_TITLE_EN.length).toBeGreaterThanOrEqual(50)
    expect(BINO_MARKETING_TITLE_EN.length).toBeLessThanOrEqual(60)
  })

  it('keeps HE/EN descriptions in the 120–160 SERP band', () => {
    expect(BINO_MARKETING_DESCRIPTION.length).toBeGreaterThanOrEqual(120)
    expect(BINO_MARKETING_DESCRIPTION.length).toBeLessThanOrEqual(160)
    expect(BINO_MARKETING_DESCRIPTION_EN.length).toBeGreaterThanOrEqual(120)
    expect(BINO_MARKETING_DESCRIPTION_EN.length).toBeLessThanOrEqual(160)
  })

  it('puts project/building/space keywords in HE H1 parts and H2s', () => {
    const he = MARKETING_COPY.he
    const h1 = `${he.brand} ${he.headline}`
    expect(h1).toMatch(/פרויקט|בניין|שטח/)
    expect(he.showcaseTitle).toMatch(/מערכת ניהול פרויקטים/)
    expect(he.howTitle).toMatch(/בניינים|שטחים/)
    expect(he.shots.every((s) => s.src.endsWith('.webp'))).toBe(true)
  })
})

describe('marketing-social sameAs', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('returns only http(s) social URLs', async () => {
    vi.stubEnv('NEXT_PUBLIC_SOCIAL_LINKEDIN', 'https://www.linkedin.com/company/bino')
    vi.stubEnv('NEXT_PUBLIC_SOCIAL_FACEBOOK', 'not-a-url')
    vi.stubEnv('NEXT_PUBLIC_SOCIAL_INSTAGRAM', '')
    const { getMarketingSocialSameAs } = await import('@/lib/marketing-social')
    expect(getMarketingSocialSameAs()).toEqual(['https://www.linkedin.com/company/bino'])
  })
})
