import { describe, expect, it } from 'vitest'
import {
  META_WHATSAPP_TEMPLATE_SPECS,
  buildMetaTemplateCreatePayload,
  getMetaTemplateSpecById,
  isMetaTemplateSpecComposable,
  sanitizeMetaTemplateNameSuffix,
} from '@/lib/whatsapp/meta-whatsapp-template-specs'

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
    const body0 = payload.components[0]
    expect(body0?.type).toBe('BODY')
    if (body0?.type === 'BODY') {
      expect(body0.text).toContain('{{1}}')
      expect(body0.example?.body_text?.[0]?.[0]).toBeTruthy()
    }
  })

  it('manager_reply create payload includes footer + QUICK_REPLY button', () => {
    const spec = getMetaTemplateSpecById('manager_reply')!
    expect(spec.buttonComponents?.[0]).toEqual({ type: 'QUICK_REPLY', text: 'קיבלתי' })
    const payload = buildMetaTemplateCreatePayload(spec)
    expect(payload.name).toBe('manager_reply')
    const types = payload.components.map((c) => c.type)
    expect(types).toEqual(['BODY', 'FOOTER', 'BUTTONS'])
    const buttons = payload.components.find((c) => c.type === 'BUTTONS')
    expect(buttons?.type).toBe('BUTTONS')
    if (buttons?.type === 'BUTTONS') {
      expect(buttons.buttons).toEqual([{ type: 'QUICK_REPLY', text: 'קיבלתי' }])
    }
    const body = payload.components.find((c) => c.type === 'BODY')
    expect(body?.type).toBe('BODY')
    if (body?.type === 'BODY') {
      expect(body.text).toContain('{{2}}')
      expect(body.text).toContain('קיבלתי')
    }
  })

  it('sanitizes suffix and rejects empty junk', () => {
    expect(sanitizeMetaTemplateNameSuffix('  Hello--World  ')).toBe('hello_world')
    expect(sanitizeMetaTemplateNameSuffix('@@@')).toBe('')
  })

  it('all Marketing specs are none — catalog stays Utility-only', () => {
    expect(META_WHATSAPP_TEMPLATE_SPECS.every((s) => s.category === 'Utility')).toBe(true)
  })
})
