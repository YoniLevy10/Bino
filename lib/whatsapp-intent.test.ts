import { describe, expect, it } from 'vitest'
import {
  looksLikeTicketDescription,
  isClarificationQuestion,
  isTicketConfirmText,
  isOpenTicketConversationalReply,
  acceptTicketDescriptionInSession,
  inferResidentLanguageFromText,
  isLikelyBareBuildingAddress,
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

describe('isLikelyBareBuildingAddress', () => {
  it('detects short street+number addresses from the screenshots', () => {
    expect(isLikelyBareBuildingAddress('אלרואי 15')).toBe(true)
    expect(isLikelyBareBuildingAddress('אלרואי')).toBe(false)
  })

  it('rejects problem descriptions even with a number', () => {
    expect(isLikelyBareBuildingAddress('נזילה בדירה 15')).toBe(false)
    expect(isLikelyBareBuildingAddress('דלת לא נסגרת בבניין 3')).toBe(false)
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
