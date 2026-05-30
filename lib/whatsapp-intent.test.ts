import { describe, expect, it } from 'vitest'
import { looksLikeTicketDescription } from './whatsapp-intent'

describe('looksLikeTicketDescription', () => {
  it('rejects short greetings', () => {
    expect(looksLikeTicketDescription('שלום')).toBe(false)
    expect(looksLikeTicketDescription('היי')).toBe(false)
  })

  it('rejects greeting with punctuation (5+ chars)', () => {
    expect(looksLikeTicketDescription('שלום!')).toBe(false)
    expect(looksLikeTicketDescription('בוקר טוב')).toBe(false)
  })

  it('accepts real problem descriptions', () => {
    expect(looksLikeTicketDescription('נזילה במקלחת')).toBe(true)
    expect(looksLikeTicketDescription('דלת לא נסגרת')).toBe(true)
  })

  it('rejects status questions', () => {
    expect(looksLikeTicketDescription('מה הסטטוס')).toBe(false)
  })
})
