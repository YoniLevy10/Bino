import { describe, expect, it } from 'vitest'
import {
  DEVELOPERS_CAPABILITIES,
  DEVELOPERS_FAQ_HE,
  DEVELOPERS_MCP_TOOLS_PREVIEW,
  DEVELOPERS_PATH,
  buildDevelopersJsonLd,
} from '@/lib/seo/developers-page'
import { SEO_GUIDES_HE, getSeoGuide } from '@/lib/seo/seo-guides-he'

describe('developers discovery page content', () => {
  it('keeps a stable public path and differentiation-oriented capabilities', () => {
    expect(DEVELOPERS_PATH).toBe('/developers')
    expect(DEVELOPERS_CAPABILITIES.length).toBe(3)
    expect(DEVELOPERS_MCP_TOOLS_PREVIEW).toContain('get_building_ops_memory')
    expect(DEVELOPERS_MCP_TOOLS_PREVIEW).toContain('get_savings_kpis')
    expect(DEVELOPERS_MCP_TOOLS_PREVIEW).not.toContain('create_ticket')
  })

  it('ships FAQ for structured data', () => {
    expect(DEVELOPERS_FAQ_HE.length).toBeGreaterThanOrEqual(3)
    const ld = buildDevelopersJsonLd()
    const graph = ld['@graph'] as Array<{ '@type': string }>
    const types = graph.map((n) => n['@type'])
    expect(types).toContain('WebPage')
    expect(types).toContain('FAQPage')
    expect(types).toContain('BreadcrumbList')
  })

  it('adds AI maintenance + MCP intent guides', () => {
    expect(getSeoGuide('tachzuka-ai-binyanim')?.primaryKeyword).toContain('AI')
    expect(getSeoGuide('mcp-api-binyanim')?.primaryKeyword).toMatch(/MCP|API/)
    expect(SEO_GUIDES_HE.some((g) => g.slug === 'tachzuka-ai-binyanim')).toBe(true)
    expect(SEO_GUIDES_HE.some((g) => g.slug === 'mcp-api-binyanim')).toBe(true)
  })
})
