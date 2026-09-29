import { describe, expect, it } from 'vitest'
import { buildMarketingJsonLd } from '@/lib/marketing-jsonld'

describe('buildMarketingJsonLd', () => {
  it('includes Organization, SoftwareApplication, and FAQPage for Hebrew', () => {
    const graph = buildMarketingJsonLd('he')['@graph'] as Array<{ '@type': string; '@id'?: string }>
    const types = graph.map((n) => n['@type'])
    expect(types).toContain('Organization')
    expect(types).toContain('WebSite')
    expect(types).toContain('WebPage')
    expect(types).toContain('SoftwareApplication')
    expect(types).toContain('FAQPage')
    const faq = graph.find((n) => n['@type'] === 'FAQPage') as
      | { mainEntity: unknown[] }
      | undefined
    expect(faq?.mainEntity?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('points English WebPage at /en', () => {
    const graph = buildMarketingJsonLd('en')['@graph'] as Array<{ '@type': string; url?: string }>
    const page = graph.find((n) => n['@type'] === 'WebPage')
    expect(page?.url).toMatch(/\/en$/)
  })
})
