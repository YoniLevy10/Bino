import { describe, expect, it } from 'vitest'
import {
  META_WHATSAPP_TEMPLATE_SPECS,
  buildMetaTemplateCreatePayload,
  getMetaTemplateSpecById,
  isMetaTemplateSpecComposable,
  sanitizeMetaTemplateNameSuffix,
} from '@/lib/meta-whatsapp-template-specs'

describe('meta whatsapp template specs (Composio create)', () => {
  it('ticket_closed is composable Utility', () => {
    const spec = getMetaTemplateSpecById('ticket_closed')
    expect(spec).toBeTruthy()
    expect(isMetaTemplateSpecComposable(spec!)).toBe(true)
  })

  it('worker_completion_photo is not auto-composable (image header)', () => {
    const spec = getMetaTemplateSpecById('worker_completion_photo')
    expect(spec).toBeTruthy()
    expect(isMetaTemplateSpecComposable(spec!)).toBe(false)
  })

  it('builds UTILITY create payload with client name suffix', () => {
    const spec = getMetaTemplateSpecById('ticket_closed')!
    const payload = buildMetaTemplateCreatePayload(spec, { nameSuffix: 'Bamakor House!' })
    expect(payload.category).toBe('UTILITY')
    expect(payload.name).toBe('ticket_closed_bamakor_house')
    expect(payload.language).toBe('he')
    expect(payload.components[0]?.type).toBe('BODY')
    expect(payload.components[0]?.text).toContain('{{1}}')
    expect(payload.components[0]?.example?.body_text?.[0]?.[0]).toBeTruthy()
  })

  it('sanitizes suffix and rejects empty junk', () => {
    expect(sanitizeMetaTemplateNameSuffix('  Hello--World  ')).toBe('hello_world')
    expect(sanitizeMetaTemplateNameSuffix('@@@')).toBe('')
  })

  it('all Marketing specs are none — catalog stays Utility-only', () => {
    expect(META_WHATSAPP_TEMPLATE_SPECS.every((s) => s.category === 'Utility')).toBe(true)
  })
})
