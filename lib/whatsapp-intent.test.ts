import { describe, expect, it } from 'vitest'
import {
  looksLikeTicketDescription,
  isClarificationQuestion,
  isTicketConfirmText,
  acceptTicketDescriptionInSession,
} from './whatsapp-intent'

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

describe('isClarificationQuestion', () => {
  it('detects how-to questions', () => {
    expect(isClarificationQuestion('איך פותחים תקלה?')).toBe(true)
    expect(isClarificationQuestion('What should I write?')).toBe(true)
    expect(isClarificationQuestion('Comment envoyer?')).toBe(true)
  })

  it('rejects real descriptions', () => {
    expect(isClarificationQuestion('נזילה במקלחת')).toBe(false)
  })
})

describe('acceptTicketDescriptionInSession', () => {
  it('accepts short problem descriptions once building is known', () => {
    expect(acceptTicketDescriptionInSession('נזילה')).toBe(true)
    expect(acceptTicketDescriptionInSession('דלת')).toBe(true)
  })

  it('rejects greetings and status questions', () => {
    expect(acceptTicketDescriptionInSession('שלום')).toBe(false)
    expect(acceptTicketDescriptionInSession('מה הסטטוס')).toBe(false)
  })
})

describe('isTicketConfirmText', () => {
  it('accepts yes in three languages', () => {
    expect(isTicketConfirmText('כן')).toBe(true)
    expect(isTicketConfirmText('oui')).toBe(true)
    expect(isTicketConfirmText('yes')).toBe(true)
  })
})
