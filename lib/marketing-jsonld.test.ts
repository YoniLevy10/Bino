import { describe, expect, it } from 'vitest'
import { buildMarketingJsonLd } from '@/lib/marketing-jsonld'
import { waDemoUrl } from '@/lib/marketing-copy'

describe('buildMarketingJsonLd', () => {
  it('includes Organization, SoftwareApplication, and FAQPage for Hebrew', () => {
    const graph = buildMarketingJsonLd()['@graph'] as Array<Record<string, unknown> & { '@type': string }>
    const types = graph.map((node) => node['@type'])
    expect(types).toContain('Organization')
    expect(types).toContain('WebSite')
    expect(types).toContain('WebPage')
    expect(types).toContain('SoftwareApplication')
    expect(types).toContain('FAQPage')
    const faq = graph.find((node) => node['@type'] === 'FAQPage') as
      | { mainEntity: unknown[] }
      | undefined
    expect(faq?.mainEntity?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('publishes only Hebrew page metadata and never exposes a street address', () => {
    const graph = buildMarketingJsonLd()['@graph'] as Array<Record<string, unknown> & { '@type': string }>
    const page = graph.find((node) => node['@type'] === 'WebPage')
    const website = graph.find((node) => node['@type'] === 'WebSite')

    expect(page?.url).not.toMatch(/\/en$/)
    expect(page?.inLanguage).toBe('he')
    expect(website?.inLanguage).toBe('he')
    expect(graph.map((node) => node['@type'])).not.toContain('LocalBusiness')
    expect(JSON.stringify(graph)).not.toContain('streetAddress')
  })
})

describe('waDemoUrl', () => {
  it('normalizes the configured Israeli phone for WhatsApp', () => {
    expect(waDemoUrl('he', '054-810-2688')).toMatch(/^https:\/\/wa\.me\/972548102688\?text=/)
  })

  it('keeps the existing demo number as fallback', () => {
    expect(waDemoUrl('he')).toMatch(/^https:\/\/wa\.me\/972548102688\?text=/)
  })
})
