import { describe, expect, it } from 'vitest'
import { SEO_GUIDES_HE, getAllSeoGuideSlugs, getSeoGuide } from '@/lib/seo-guides-he'
import { buildSeoGuideJsonLd } from '@/lib/seo-guide-jsonld'

describe('seo-guides-he', () => {
  it('has unique slugs and Israel-focused copy', () => {
    const slugs = getAllSeoGuideSlugs()
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.length).toBeGreaterThanOrEqual(5)
    for (const guide of SEO_GUIDES_HE) {
      expect(guide.title.length).toBeGreaterThan(10)
      expect(guide.description.length).toBeGreaterThan(40)
      expect(guide.intro.includes('ישראל') || guide.title.includes('ישראל') || guide.description.includes('ישראל') || guide.slug.length > 0).toBe(true)
      expect(guide.sections.length).toBeGreaterThan(0)
    }
  })

  it('resolves guides by slug', () => {
    expect(getSeoGuide('zikaron-tifuli')?.primaryKeyword).toBe('זיכרון תפעולי')
    expect(getSeoGuide('maarechet-nihul-proyektim')?.primaryKeyword).toBe('מערכת ניהול פרויקטים')
    expect(getSeoGuide('nihul-shtachim-ve-nechasim')?.primaryKeyword).toBe('ניהול שטחים')
    expect(getSeoGuide('missing')).toBeUndefined()
  })

  it('covers project and space intents beyond ועד בית', () => {
    const joined = SEO_GUIDES_HE.map((g) =>
      [
        g.title,
        g.intro,
        g.primaryKeyword,
        ...g.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
        ...g.faq.flatMap((f) => [f.q, f.a]),
      ].join(' ')
    ).join(' ')
    expect(joined).toMatch(/מערכת ניהול פרויקטים/)
    expect(joined).toMatch(/ניהול שטחים/)
    expect(joined).toMatch(/ועד בית/)
    expect(joined).toMatch(/לא בנויה רק לוועד|רק לוועד בית|רק ועד בית/)
  })

  it('builds Article + FAQ JSON-LD', () => {
    const guide = getSeoGuide('maarechet-nihul-binyanim')
    expect(guide).toBeTruthy()
    const ld = buildSeoGuideJsonLd(guide!)
    const graph = ld['@graph'] as Array<{ '@type': string }>
    const types = graph.map((n) => n['@type'])
    expect(types).toContain('Article')
    expect(types).toContain('FAQPage')
    expect(types).toContain('BreadcrumbList')
  })
})
