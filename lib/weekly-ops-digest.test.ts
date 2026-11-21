import { describe, expect, it } from 'vitest'
import {
  buildWeeklyDigestStats,
  formatWeeklyOpsDigestSms,
  israelWeekStartIso,
} from '@/lib/ops/weekly-ops-digest'
import { sanitizeSmsCampaignBody } from '@/lib/sms/sms-campaign-message'

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

describe('sanitizeSmsCampaignBody', () => {
  it('strips emoji but keeps newlines for structured digests', () => {
    const cleaned = sanitizeSmsCampaignBody('שורה א\n\nשורה ב 🎉')
    expect(cleaned).toBe('שורה א\n\nשורה ב')
    expect(cleaned).toContain('\n')
  })
})

describe('formatWeeklyOpsDigestSms', () => {
  it('formats a scannable sectioned digest with day+hour age', () => {
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

    expect(body).toBe(
      [
        'Bamakor',
        'סיכום השבוע',
        '',
        'תנועה השבוע',
        'נפתחו 14 תקלות ונסגרו 18.',
        '',
        'פתוחות עכשיו',
        '2 תקלות, כולן עברו את זמן הטיפול.',
        '',
        'הכי דחופה',
        'תקלה 289',
        'יוסי בן יועזר 19',
        'משויכת',
        'פתוחה 2 ימים ו־23 שעות',
        'האור בנחיתה בקומה השישית דולק תמיד.',
        '',
        'תקלות חוזרות',
        '9 מתוך 14 שנפתחו השבוע הן חזרה על תקלה קודמת.',
        '',
        'שבת שלום',
      ].join('\n')
    )
    expect(body).not.toContain('שמרה עליך')
    expect(body).not.toContain('בסיכון')
    expect(body).not.toMatch(/#/)
    expect(body).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
    // Delivery path must keep the structure
    expect(sanitizeSmsCampaignBody(body)).toBe(body)
  })

  it('matches the owner Bamakor sample shape (7/10/6/5/400h)', () => {
    const stats = buildWeeklyDigestStats({
      clientName: 'Bamakor',
      opened: 7,
      closed: 10,
      recurringOpened: 2,
      now: new Date('2026-11-20T12:00:00.000Z'),
      openTickets: [
        {
          ticketNumber: 290,
          building: 'יוסי בן יועזר 19',
          description: 'אינטרקום תקול',
          startedAt: '2026-11-03T20:00:00.000Z', // 400h before now
          slaHours: 24,
          assigned: true,
        },
        ...Array.from({ length: 4 }, (_, i) => ({
          ticketNumber: 291 + i,
          building: 'אלרואי 5א',
          description: 'תקלה נוספת',
          startedAt: '2026-11-10T12:00:00.000Z',
          slaHours: 24,
          assigned: true,
        })),
        {
          ticketNumber: 295,
          building: 'אלרואי 5א',
          description: 'תקלה בתוך SLA',
          startedAt: '2026-11-20T06:00:00.000Z', // 6h — still in time
          slaHours: 24,
          assigned: true,
        },
      ],
    })
    const body = formatWeeklyOpsDigestSms(stats)

    expect(body).toContain('תנועה השבוע')
    expect(body).toContain('נפתחו 7 תקלות ונסגרו 10.')
    expect(body).toContain('פתוחות עכשיו')
    expect(body).toContain('6 תקלות, מתוכן 5 עברו את זמן הטיפול.')
    expect(body).toContain('הכי דחופה')
    expect(body).toContain('תקלה 290')
    expect(body).toContain('יוסי בן יועזר 19')
    expect(body).toContain('משויכת')
    expect(body).toContain('פתוחה 16 ימים ו־16 שעות')
    expect(body).not.toContain('400 שעות')
    expect(body).toContain('אינטרקום תקול')
    expect(body).toContain('תקלות חוזרות')
    expect(body).toContain('2 מתוך 7 שנפתחו השבוע הן חזרה על תקלה קודמת.')
    expect(body.endsWith('שבת שלום')).toBe(true)
    expect(body.indexOf('שבת שלום')).toBeGreaterThan(body.indexOf('תקלות חוזרות'))
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
    expect(body).toContain('תקלה אחת, בתוך זמן הטיפול.')
    expect(body).toContain('עדיין פתוחה')
    expect(body).toContain('תקלה 270')
    expect(body).toContain('אלרואי 5א')
    expect(body).toContain('עדיין בלי שיוך')
    expect(body).toContain('פתוחה שעה')
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
    expect(body).toContain('תנועה השבוע')
    expect(body).toContain('לא נפתחו ולא נסגרו תקלות.')
    expect(body).toContain('פתוחות עכשיו')
    expect(body).toContain('אין תקלות פתוחות')
    expect(body).not.toContain('תקלות חוזרות')
    expect(body.endsWith('שבת שלום')).toBe(true)
  })
})
