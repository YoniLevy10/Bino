import { describe, it, expect } from 'vitest'
import {
  parseProjectListReplyId,
  buildProjectListRows,
  parseConfirmButtonReplyId,
  parseLanguageButtonReplyId,
  parseLastProjectButtonReplyId,
} from '@/lib/whatsapp-interactive'

describe('whatsapp-interactive', () => {
  it('parseProjectListReplyId', () => {
    expect(parseProjectListReplyId('proj_0')).toBe(0)
    expect(parseProjectListReplyId('proj_2')).toBe(2)
    expect(parseProjectListReplyId('bad')).toBeNull()
  })

  it('buildProjectListRows prefers street address as title', () => {
    const rows = buildProjectListRows([
      { id: '1', name: 'פרויקט אלרואי', project_code: 'BMK1', address: 'אלרואי 5' },
    ])
    expect(rows[0].id).toBe('proj_0')
    expect(rows[0].title).toBe('אלרואי 5')
    expect(rows[0].description).toBe('פרויקט אלרואי')
  })

  it('parseLastProjectButtonReplyId', () => {
    expect(parseLastProjectButtonReplyId('last_proj_same')).toBe('same')
    expect(parseLastProjectButtonReplyId('last_proj_other')).toBe('other')
    expect(parseLastProjectButtonReplyId('lang_he')).toBeNull()
  })

  it('parseConfirmButtonReplyId', () => {
    expect(parseConfirmButtonReplyId('ticket_confirm')).toBe('confirm')
    expect(parseConfirmButtonReplyId('ticket_cancel')).toBe('cancel')
  })

  it('parseLanguageButtonReplyId', () => {
    expect(parseLanguageButtonReplyId('lang_he')).toBe('he')
    expect(parseLanguageButtonReplyId('lang_fr')).toBe('fr')
    expect(parseLanguageButtonReplyId('lang_en')).toBe('en')
    expect(parseLanguageButtonReplyId('other')).toBeNull()
  })
})
