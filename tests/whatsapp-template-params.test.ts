import { describe, expect, it } from 'vitest'
import {
  sanitizeWhatsAppTemplateParam,
  sanitizeWhatsAppTemplateParams,
} from '@/lib/whatsapp-template-params'
import { isNonRetryableWhatsAppMetaError, whatsAppMetaErrorHint } from '@/lib/whatsapp-meta-errors'

describe('sanitizeWhatsAppTemplateParam', () => {
  it('strips newlines and tabs that trigger Meta 132018', () => {
    expect(sanitizeWhatsAppTemplateParam('שורה1\nשורה2\tסוף')).toBe('שורה1 שורה2 סוף')
  })

  it('collapses 4+ consecutive spaces', () => {
    expect(sanitizeWhatsAppTemplateParam('א    ב')).toBe('א   ב')
  })

  it('uses fallback for empty / whitespace-only', () => {
    expect(sanitizeWhatsAppTemplateParam('   \n\t  ', 'ללא תיאור')).toBe('ללא תיאור')
  })

  it('sanitizes a param list', () => {
    expect(sanitizeWhatsAppTemplateParams(['בניין\nא', '12', 'תיאור\r\nארוך'])).toEqual([
      'בניין א',
      '12',
      'תיאור ארוך',
    ])
  })
})

describe('Meta 132018 handling', () => {
  it('is non-retryable and has a Hebrew hint', () => {
    expect(isNonRetryableWhatsAppMetaError(132018)).toBe(true)
    expect(whatsAppMetaErrorHint(132018)).toContain('פרמטרי התבנית')
  })
})
