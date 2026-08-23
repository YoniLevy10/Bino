import { describe, expect, it } from 'vitest'
import {
  looksLikeTicketDescription,
  isClarificationQuestion,
  isTicketConfirmText,
  isOpenTicketConversationalReply,
  acceptTicketDescriptionInSession,
  inferResidentLanguageFromText,
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

describe('isOpenTicketConversationalReply', () => {
  it('treats yes / thanks / emoji as conversational', () => {
    expect(isOpenTicketConversationalReply('כן')).toBe(true)
    expect(isOpenTicketConversationalReply('תודה')).toBe(true)
    expect(isOpenTicketConversationalReply('👍')).toBe(true)
  })

  it('rejects real problem descriptions', () => {
    expect(isOpenTicketConversationalReply('נזילה במקלחת')).toBe(false)
  })
})

describe('inferResidentLanguageFromText', () => {
  it('defaults Hebrew for Hebrew text', () => {
    expect(inferResidentLanguageFromText('נזילה ברחוב הרצל 5')).toBe('he')
  })

  it('detects English', () => {
    expect(inferResidentLanguageFromText('water leak in the bathroom please help')).toBe('en')
  })

  it('detects French', () => {
    expect(inferResidentLanguageFromText('fuite dans la salle de bain')).toBe('fr')
  })

  it('returns null for ambiguous short input', () => {
    expect(inferResidentLanguageFromText('👍')).toBe(null)
  })
})
