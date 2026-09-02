import { describe, expect, it } from 'vitest'
import { TemplateImageProvider } from '@/lib/mbrain/providers/image'
import { StubLLMProvider } from '@/lib/mbrain/providers/llm'
import { getMetaDataLabel, getMetaMode } from '@/lib/mbrain/meta/client'
import { sanitizeMbrainLogValue } from '@/lib/mbrain/logging'
import { createBrandSchema } from '@/lib/mbrain/types'

describe('mbrain providers & meta labels', () => {
  it('template image provider returns zero-cost svg for all ratios', async () => {
    const p = new TemplateImageProvider()
    for (const aspectRatio of ['1:1', '4:5', '9:16'] as const) {
      const r = await p.generate({
        prompt: 'WhatsApp is not a maintenance system',
        aspectRatio,
        brandId: 'b1000000-0000-4000-8000-000000000001',
        headline: 'במקור',
        subheadline: 'מערכת אחזקה במקום וואטסאפ',
      })
      expect(r.estimatedCostUsd).toBe(0)
      expect(r.kind).toBe('svg')
      expect(r.content).toContain('<svg')
    }
  })

  it('stub llm costs nothing', async () => {
    const llm = new StubLLMProvider()
    const r = await llm.complete({
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(r.estimatedCostUsd).toBe(0)
    expect(r.provider).toBe('stub')
  })

  it('never silently labels mock as live', () => {
    // Without META_MODE=live, must be mock
    expect(getMetaMode()).toBe('mock')
    expect(getMetaDataLabel()).toBe('MOCK DATA')
  })

  it('redacts tokens in logs', () => {
    const sanitized = sanitizeMbrainLogValue({
      access_token: 'EAABsecret',
      campaignId: '123',
    }) as Record<string, unknown>
    expect(sanitized.access_token).toBe('[redacted]')
    expect(sanitized.campaignId).toBe('123')
  })

  it('validates brand slug', () => {
    expect(createBrandSchema.safeParse({ name: 'Test', slug: 'Bad Slug' }).success).toBe(false)
    expect(createBrandSchema.safeParse({ name: 'Test', slug: 'good-slug' }).success).toBe(true)
  })
})
