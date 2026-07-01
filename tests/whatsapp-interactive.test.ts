import { describe, it, expect } from 'vitest'
import {
  parseProjectListReplyId,
  buildProjectListRows,
  parseConfirmButtonReplyId,
  parseLanguageButtonReplyId,
} from '@/lib/whatsapp-interactive'

describe('whatsapp-interactive', () => {
  it('parseProjectListReplyId', () => {
    expect(parseProjectListReplyId('proj_0')).toBe(0)
    expect(parseProjectListReplyId('proj_2')).toBe(2)
    expect(parseProjectListReplyId('bad')).toBeNull()
  })

  it('buildProjectListRows', () => {
    const rows = buildProjectListRows([
      { id: '1', name: 'בניין א', project_code: 'BMK1', address: 'רחוב 1' },
    ])
    expect(rows[0].id).toBe('proj_0')
    expect(rows[0].title).toContain('בניין')
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
