import { describe, expect, it } from 'vitest'
import {
  buildWeeklyDigestStats,
  formatWeeklyOpsDigestSms,
  israelWeekStartIso,
} from '@/lib/weekly-ops-digest'

const NOW = new Date('2026-11-06T09:50:00.000Z')

describe('israelWeekStartIso', () => {
  it('starts the Israeli work week on Sunday 00:00 Jerusalem', () => {
    expect(israelWeekStartIso(new Date('2026-11-06T09:00:00.000Z'))).toBe('2026-10-31T22:00:00.000Z')
    expect(israelWeekStartIso(new Date('2026-11-07T21:59:00.000Z'))).toBe('2026-10-31T22:00:00.000Z')
    expect(israelWeekStartIso(new Date('2026-11-07T22:00:00.000Z'))).toBe('2026-11-07T22:00:00.000Z')
  })

  it('uses summer time when Jerusalem is UTC+3', () => {
    expect(israelWeekStartIso(new Date('2026-06-10T10:00:00.000Z'))).toBe('2026-06-06T21:00:00.000Z')
  })
})

describe('formatWeeklyOpsDigestSms', () => {
  it('says which open tickets are already past handling time', () => {
    const stats = buildWeeklyDigestStats({
      clientName: 'Bamakor',
      opened: 14,
      closed: 18,
      recurringOpened: 9,
      now: NOW,
      openTickets: [
        {
          ticketNumber: 289,
          building: 'יוסי בן יועזר 19',
          description: 'האור בנחיתה בקומה השישית דולק תמיד.',
          startedAt: '2026-11-03T10:20:00.000Z',
          slaHours: 24,
          assigned: true,
        },
        {
          ticketNumber: 294,
          building: 'אלרואי 5א',
          description: 'תקלת הריח הופיעה שוב',
          startedAt: '2026-11-05T08:16:00.000Z',
          slaHours: 24,
          assigned: true,
        },
      ],
    })
    const body = formatWeeklyOpsDigestSms(stats)

    expect(body).toContain('סיכום השבוע')
    expect(body).toContain('נפתחו 14 תקלות ונסגרו 18.')
    expect(body).toContain('פתוחות עכשיו 2, וכולן עברו את זמן הטיפול.')
    expect(body).toContain('הכי דחופה: תקלה 289 ביוסי בן יועזר 19.')
    expect(body).toContain('משויכת, פתוחה 71 שעות.')
    expect(body).toContain('האור בנחיתה בקומה השישית דולק תמיד.')
    expect(body).toContain('9 מתוך 14 התקלות שנפתחו הן חזרה על תקלה קודמת.')
    expect(body).toContain('שבת שלום')
    expect(body).not.toContain('שמרה עליך')
    expect(body).not.toContain('בסיכון')
    expect(body).not.toMatch(/#/)
    expect(body).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('drops an English description and does not call an in-time ticket overdue', () => {
    const stats = buildWeeklyDigestStats({
      clientName: 'Bamakor',
      opened: 1,
      closed: 0,
      recurringOpened: 0,
      now: NOW,
      openTickets: [
        {
          ticketNumber: 270,
          building: 'אלרואי 5א',
          description: 'Dear Cora,',
          startedAt: '2026-11-06T08:00:00.000Z',
          slaHours: 24,
          assigned: false,
        },
      ],
    })
    const body = formatWeeklyOpsDigestSms(stats)

    expect(body).toContain('נפתחה תקלה אחת, ולא נסגרה אף תקלה.')
    expect(body).toContain('פתוחה תקלה אחת, בתוך זמן הטיפול.')
    expect(body).toContain('עדיין פתוחה: תקלה 270 באלרואי 5א.')
    expect(body).toContain('עדיין בלי שיוך, פתוחה שעה.')
    expect(body).not.toContain('Dear')
    expect(body).not.toContain('Cora')
  })

  it('handles a quiet week', () => {
    const body = formatWeeklyOpsDigestSms(
      buildWeeklyDigestStats({
        clientName: 'Bamakor',
        opened: 0,
        closed: 0,
        recurringOpened: 0,
        openTickets: [],
        now: NOW,
      })
    )
    expect(body).toContain('השבוע לא נפתחו ולא נסגרו תקלות.')
    expect(body).toContain('אין תקלות פתוחות')
  })
})
