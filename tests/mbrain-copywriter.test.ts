import { describe, expect, it } from 'vitest'
import { generateCopyForHypothesis } from '@/lib/mbrain/agents/copywriter'

describe('copywriter', () => {
  it('maps each variation to the same hypothesis/angle', () => {
    const hypId = 'b1000000-0000-4000-8000-000000000099'
    const copies = generateCopyForHypothesis({
      brandName: 'במקור',
      hypothesis: {
        id: hypId,
        creative_angle: 'Your maintenance department should not live inside WhatsApp.',
        statement: 'Property managers are overwhelmed by resident WhatsApp messages.',
        target_pain: 'בקשות אחזקה מפוזרות בוואטסאפ',
        target_persona: 'מנהל בחברת ניהול נכסים בישראל',
      },
    })
    expect(copies.length).toBeGreaterThanOrEqual(3)
    for (const c of copies) {
      expect(c.hypothesisId).toBe(hypId)
      expect(c.angle).toContain('WhatsApp')
      expect(c.primaryText.length).toBeGreaterThan(40)
      expect(c.headline.length).toBeGreaterThan(5)
    }
  })
})
