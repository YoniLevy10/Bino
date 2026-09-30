import { describe, expect, it } from 'vitest'
import {
  buildInboxTemplatePreview,
  getInboxMetaTemplateById,
  isInboxComposeTemplate,
  listInboxReadyTemplates,
  WHATSAPP_INBOX_META_TEMPLATES,
  type InboxMetaTemplate,
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

  it('lists every catalog template except manager_reply as ready actions', () => {
    const ready = listInboxReadyTemplates(WHATSAPP_INBOX_META_TEMPLATES)
    expect(ready.map((t) => t.id).sort()).toEqual(['sla_escalation', 'ticket_closed'])
    expect(ready.every((t) => !isInboxComposeTemplate(t.id))).toBe(true)
  })

  it('builds generic preview for unknown catalog templates via {{placeholders}}', () => {
    const custom: InboxMetaTemplate = {
      id: 'custom_notice',
      label: 'הודעה מותאמת',
      description: 'בדיקה',
      language: 'he',
      resolveMetaName: () => 'custom_notice',
      preview: 'שלום {{שם}}, לגבי {{נושא}}',
      params: [
        { key: 'name', label: 'שם', placeholder: '', maxLength: 40 },
        { key: 'topic', label: 'נושא', placeholder: '', maxLength: 80 },
      ],
    }
    expect(buildInboxTemplatePreview(custom, ['דנה', 'מים'])).toBe('שלום דנה, לגבי מים')
  })
})
