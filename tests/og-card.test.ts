import { describe, expect, it } from 'vitest'
import {
  BINO_OG_HEADLINE,
  BINO_OG_SUBLINE,
  binoOgImagePath,
  renderBinoOgPng,
  renderBinoOgSvg,
} from '@/lib/marketing/og-card'
import { BINO_OG_IMAGE_VERSION, getMarketingOgImageUrl } from '@/lib/marketing/marketing-site'

describe('BINO OG card', () => {
  it('passes logical Hebrew into Satori (no visual-reverse hack)', async () => {
    const svg = await renderBinoOgSvg()
    expect(svg.startsWith('<svg')).toBe(true)
    expect(BINO_OG_HEADLINE).toMatch(/^ז/)
    expect(BINO_OG_HEADLINE.endsWith('בניין')).toBe(true)
    expect(BINO_OG_SUBLINE).toContain('·')
    expect(svg.length).toBeGreaterThan(5_000)
  }, 30_000)

  it('renders a valid PNG at 1200×630', async () => {
    const png = await renderBinoOgPng()
    expect(png.subarray(0, 8).toString('binary')).toBe('\x89PNG\r\n\x1a\n')
    expect(png.byteLength).toBeGreaterThan(20_000)
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  }, 30_000)

  it('exposes a cache-busting og:image path', () => {
    expect(binoOgImagePath()).toBe(`/opengraph-image?v=${BINO_OG_IMAGE_VERSION}`)
    expect(getMarketingOgImageUrl()).toContain(`v=${BINO_OG_IMAGE_VERSION}`)
  })
})
