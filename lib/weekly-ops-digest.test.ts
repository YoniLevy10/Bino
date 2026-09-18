import { describe, expect, it } from 'vitest'
import { formatWeeklyOpsDigestSms } from '@/lib/weekly-ops-digest'

describe('formatWeeklyOpsDigestSms', () => {
  it('formats a warm weekly wrap for Sarah-style volume', () => {
    const body = formatWeeklyOpsDigestSms({
      clientName: 'Bamakor',
      opened: 4,
      closed: 6,
      openNow: 2,
      openSlaRisk: 0,
      recurringOpened: 3,
      focus: {
        ticketNumber: 244,
        building: 'בוזגלו 4',
        description: 'נזילה ב-1',
        slaAlerted: false,
      },
    })

    expect(body).toBe(`BINO - סיכום שבועי לBamakor

השבוע: נפתחו 4, נסגרו 6.
פתוחות עכשיו: 2 (אין סיכון SLA כרגע).
תקלות שסומנו כחוזרות השבוע: 3.

נקודה למעקב: תקלה #244 בבוזגלו 4 - נזילה ב-1

BINO עקב אחרי השבוע בשבילך. שבת שלום.`)
    expect(body).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('handles a quiet week', () => {
    const body = formatWeeklyOpsDigestSms({
      clientName: 'Bamakor',
      opened: 0,
      closed: 0,
      openNow: 0,
      openSlaRisk: 0,
      recurringOpened: 0,
      focus: null,
    })
    expect(body).toContain('שקט יחסית')
    expect(body).toContain('אין תקלות פתוחות')
  })
})
