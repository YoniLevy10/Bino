import { describe, expect, it } from 'vitest'
import {
  formatWhatsAppTemplateFailureMessage,
  isNonRetryableWhatsAppMetaError,
  resolveWhatsAppRetryTemplateName,
  whatsAppMetaErrorHint,
} from '@/lib/whatsapp-meta-errors'

describe('whatsapp-meta-errors', () => {
  it('maps Meta 132001 to template approval hint', () => {
    expect(whatsAppMetaErrorHint(132001)).toContain('לא קיימת או לא מאושרת')
    expect(isNonRetryableWhatsAppMetaError(132001)).toBe(true)
  })

  it('maps Meta 190 to token hint', () => {
    expect(whatsAppMetaErrorHint(190)).toContain('טוקן')
    expect(isNonRetryableWhatsAppMetaError(190)).toBe(true)
  })

  it('resolves retry template name from template_name or body', () => {
    expect(
      resolveWhatsAppRetryTemplateName({
        template_name: 'ticket_closed',
        body: 'שלום מהמשרד',
      })
    ).toBe('ticket_closed')

    expect(
      resolveWhatsAppRetryTemplateName({
        body: 'manager_reply',
      })
    ).toBe('manager_reply')

    expect(
      resolveWhatsAppRetryTemplateName({
        body: 'שלום מהמשרד',
        send_kind: 'template',
      })
    ).toBe('')
  })

  it('formats template failure with Meta code', () => {
    const msg = formatWhatsAppTemplateFailureMessage('ticket_closed', {
      httpStatus: 400,
      metaCode: 132001,
      message: 'Template name does not exist in the translation',
    })
    expect(msg).toContain('ticket_closed')
    expect(msg).toContain('132001')
    expect(msg).toContain('Template name does not exist')
  })
})
