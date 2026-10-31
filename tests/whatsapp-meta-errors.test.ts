import { describe, expect, it } from 'vitest'
import {
  extractWhatsAppMessageId,
  formatWhatsAppTemplateFailureMessage,
  formatWhatsAppTextFailureMessage,
  isNonRetryableWhatsAppMetaError,
  isTransientWhatsAppSendFailure,
  isWhatsAppFreeTextRetry,
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

  it('treats timeout/network as transient and Meta template errors as not', () => {
    expect(isTransientWhatsAppSendFailure({ httpStatus: 0, message: 'timeout' })).toBe(true)
    expect(isTransientWhatsAppSendFailure({ httpStatus: 0, message: 'fetch failed' })).toBe(true)
    expect(isTransientWhatsAppSendFailure({ httpStatus: 400, metaCode: 132001 })).toBe(false)
    expect(isTransientWhatsAppSendFailure(undefined)).toBe(false)
  })

  it('formats text failure with Meta details when present', () => {
    expect(formatWhatsAppTextFailureMessage({ httpStatus: 0, message: 'timeout' })).toContain(
      'timeout/error'
    )
    const msg = formatWhatsAppTextFailureMessage({
      httpStatus: 400,
      metaCode: 131026,
      message: 'Message undeliverable',
    })
    expect(msg).toContain('131026')
    expect(msg).toContain('Message undeliverable')
  })

  it('extracts Meta wamid from send response', () => {
    expect(extractWhatsAppMessageId({ messages: [{ id: 'wamid.ABC' }] })).toBe('wamid.ABC')
    expect(extractWhatsAppMessageId({ messages: [] })).toBeNull()
    expect(extractWhatsAppMessageId(null)).toBeNull()
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

  it('classifies ticket_reply / worker_ticket_reply as free-text retry (not template)', () => {
    expect(
      isWhatsAppFreeTextRetry({
        send_kind: 'ticket_reply',
        body: 'הנושא יבדק מחר',
      })
    ).toBe(true)

    expect(
      isWhatsAppFreeTextRetry({
        send_kind: 'worker_ticket_reply',
        body: 'סיימתי את העבודה',
      })
    ).toBe(true)

    expect(
      isWhatsAppFreeTextRetry({
        send_kind: 'text',
        body: 'שלום',
      })
    ).toBe(true)

    expect(
      isWhatsAppFreeTextRetry({
        send_kind: 'template',
        body: 'שלום',
        template_name: 'manager_reply',
      })
    ).toBe(false)

    expect(
      isWhatsAppFreeTextRetry({
        send_kind: 'ticket_reply',
        body: '',
      })
    ).toBe(false)
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

  it('formats worker_assignment_notice timeout distinctly from generic failure', () => {
    const timeoutMsg = formatWhatsAppTemplateFailureMessage('worker_assignment_notice', {
      httpStatus: 0,
      message: 'timeout',
    })
    expect(timeoutMsg).toContain('worker_assignment_notice')
    expect(timeoutMsg).toContain('timeout או שגיאת רשת')
  })
})
