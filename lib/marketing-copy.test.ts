import { describe, expect, it } from 'vitest'
import { MARKETING_COPY, waDemoUrl } from './marketing-copy'

describe('marketing-copy', () => {
  it('exposes Hebrew and English packs with matching structure', () => {
    expect(MARKETING_COPY.he.dir).toBe('rtl')
    expect(MARKETING_COPY.en.dir).toBe('ltr')
    expect(MARKETING_COPY.he.metrics).toHaveLength(MARKETING_COPY.en.metrics.length)
    expect(MARKETING_COPY.he.shots).toHaveLength(3)
    expect(MARKETING_COPY.en.shots).toHaveLength(3)
    expect(MARKETING_COPY.he.faq.length).toBe(MARKETING_COPY.en.faq.length)
    expect(MARKETING_COPY.he.faq.length).toBeGreaterThanOrEqual(3)
  })

  it('builds WhatsApp demo links with locale-specific text', () => {
    const he = waDemoUrl('he')
    const en = waDemoUrl('en')
    expect(he).toContain('wa.me/972548102688')
    expect(en).toContain('wa.me/972548102688')
    expect(he).not.toBe(en)
    expect(decodeURIComponent(he)).toContain('BINO')
    expect(decodeURIComponent(en)).toContain('demo of BINO')
  })
})
