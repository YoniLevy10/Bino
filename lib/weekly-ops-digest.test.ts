import { describe, expect, it } from 'vitest'
import { formatWeeklyOpsDigestSms } from '@/lib/weekly-ops-digest'

describe('formatWeeklyOpsDigestSms', () => {
  it('formats labeled Hebrew lines that survive RTL SMS clients', () => {
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

    expect(body).toContain('סיכום שבועי מבינו')
    expect(body).toContain('עבור Bamakor')
    expect(body).toContain('נפתחו השבוע: 4')
    expect(body).toContain('נסגרו השבוע: 6')
    expect(body).toContain('פתוחות עכשיו: 2')
    expect(body).toContain('בסיכון לחריגת זמן: אין')
    expect(body).toContain('תקלה 244 בבוזגלו 4')
    expect(body).not.toMatch(/BINO -/)
    expect(body).not.toMatch(/#/)
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
    expect(body).toContain('שקט')
    expect(body).toContain('אין תקלות פתוחות')
  })
})
