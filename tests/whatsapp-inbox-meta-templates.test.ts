import { describe, expect, it } from 'vitest'
import {
  buildInboxTemplatePreview,
  getInboxMetaTemplateById,
} from '@/lib/whatsapp-inbox-meta-templates'
import {
  managerReplyTemplateParams,
  residentFirstNameForTemplate,
} from '@/lib/whatsapp-inbox-context'

describe('whatsapp inbox meta templates', () => {
  it('includes manager_reply template', () => {
    const tpl = getInboxMetaTemplateById('manager_reply')
    expect(tpl?.resolveMetaName()).toBe('manager_reply')
    expect(tpl?.params).toHaveLength(2)
  })

  it('builds manager_reply preview from params', () => {
    const tpl = getInboxMetaTemplateById('manager_reply')!
    const preview = buildInboxTemplatePreview(tpl, ['יוני', 'נגיע מחר ב-9'])
    expect(preview).toContain('שלום יוני')
    expect(preview).toContain('נגיע מחר ב-9')
    expect(preview).not.toContain('משרד')
  })

  it('residentFirstNameForTemplate skips placeholder name', () => {
    expect(residentFirstNameForTemplate('דייר WhatsApp')).toBe('דייר/ה')
    expect(residentFirstNameForTemplate('יוני שולמן')).toBe('יוני')
  })

  it('managerReplyTemplateParams caps message length', () => {
    const params = managerReplyTemplateParams(
      {
        resident_name: 'יוני',
        building_name: null,
        open_ticket: null,
        recent_closed_ticket: null,
      },
      'x'.repeat(600)
    )
    expect(params[0]).toBe('יוני')
    expect(params[1]).toHaveLength(500)
  })
})
