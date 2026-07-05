/** Lightweight intent detection for WhatsApp resident messages (Hebrew-first). */

import { ticketStatusLabelHe } from '@/lib/ticket-status'
import type { ResidentLang } from '@/lib/whatsapp-bilingual-template'

const GREETING_TOKENS = new Set([
  'שלום',
  'היי',
  'הי',
  'בוקר',
  'ערב',
  'לילה',
  'תודה',
  'תודהרבה',
  'אוקיי',
  'אוקי',
  'סבבה',
  'בסדר',
  'נשמע',
  'נשמעטוב',
])

export function isGreetingSmallTalk(text: string): boolean {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t || t.length > 40) return false
  if (/^(בוקר טוב|ערב טוב|לילה טוב|תודה רבה|נשמע טוב)\b/i.test(t)) return true
  const lower = t.toLowerCase().replace(/[!?.…,:;'"׳״]/g, '')
  const compact = lower.replace(/\s+/g, '')
  if (!compact) return false
  if (/^(שלום|היי|הי|בוקרטוב|ערבטוב|לילהטוב|תודה|תודהרבה|אוקיי|אוקי|סבבה|בסדר|נשמעטוב|נשמע)$/.test(compact)) return true
  const words = lower.split(' ').filter(Boolean)
  if (words.length <= 3 && words.every((w) => GREETING_TOKENS.has(w.replace(/[!?.]/g, '')) || w === 'טוב' || w === 'רבה')) {
    return true
  }
  return false
}

const URGENT_KEYWORDS =
  /דחוף|חירום|מצב\s*חירום|אש\b|שריפה|מים\s*שוטפים|מים\s*שוטף|נזילה\s*דחופה|sos|urgent|emergency|!!!{2,}/i

/** Strict tenant keywords → DB priority URGENT (task 31). */
const URGENT_PRIORITY_STRICT = /דחוף|urgent|אחריותית|אחריותי/i

export function isUrgentAngryMessage(text: string): boolean {
  return URGENT_KEYWORDS.test(text.trim())
}

/** Maps resident free text to ticket priority incl. URGENT. */
export function resolveTicketPriorityFromResidentMessage(text: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
  const t = text.trim()
  if (URGENT_PRIORITY_STRICT.test(t)) return 'URGENT'
  if (isUrgentAngryMessage(t)) return 'HIGH'
  return 'MEDIUM'
}

/** Status / progress questions (avoid matching casual "מה קורה" in long descriptions). */
export function isStatusQuestion(text: string): boolean {
  const t = text.trim()
  if (/^(סטטוס|מה\s*קורה|עדכון)(\s*[?؟]*)?$/i.test(t.replace(/\u200f/g, ''))) return true
  if (/^מה\s*(ה)?סטטוס(\s*[?؟]*)?$/i.test(t.replace(/\u200f/g, ''))) return true
  if (t.length > 120) return false
  if (/עדכון\s*[?؟]?$/i.test(t)) return true
  if (/מתי\s*(יהיה\s*)?(טיפול|יטפלו|תטפלו|מגיע)/i.test(t)) return true
  if (/מה\s*קורה\s*(עם|עם ה|עם ה)?\s*(ה)?תקל/i.test(t)) return true
  if (/סטטוס\s*(של|שלי|של ה)?\s*(ה)?תקל/i.test(t)) return true
  if (/איפה\s*התקלה/i.test(t)) return true
  if (/מה\s*המצב/i.test(t)) return true
  if (/^(נפתר|טופל|סגור)\s*[?؟]?$/i.test(t)) return true
  if (/נשלח\s*טכנאי/i.test(t)) return true
  return false
}

/** Short message that looks like apartment / floor only (not full ticket description). */
export function parseApartmentDetailOnly(text: string): string | null {
  const t = text.trim()
  if (t.length < 3 || t.length > 80) return null
  if (
    /^(דירה|דירת)\s*[\dא-ת\/\-]+(\s|$)/i.test(t) ||
    /^(קומה|קומת)\s*[\dא-ת]+/i.test(t) ||
    /^אפרט\s*[\dא-ת]+/i.test(t) ||
    /^מספר\s*דירה\s*[\d]+/i.test(t)
  ) {
    return t
  }
  return null
}

const PHONE_IL = /(?:\+?972|0)?-?5[0-9]-?[0-9]{7}/

export function looksLikePhoneOrNameLine(text: string): boolean {
  const t = text.trim()
  if (PHONE_IL.test(t) && t.length <= 22) return true
  if (/^שמי\s+[\u0590-\u05FFa-zA-Z\-\s]{1,40}$/i.test(t)) return true
  if (/^אני\s+[\u0590-\u05FFa-zA-Z\-\s]{1,40}$/i.test(t)) return true
  return false
}

export function isPrimarilyEnglishText(text: string): boolean {
  const t = text.trim()
  if (t.length < 2 || t.length > 500) return false
  const hebrew = (t.match(/[\u0590-\u05FF]/g) || []).length
  const latin = (t.match(/[a-zA-Z]/g) || []).length
  if (hebrew >= 3) return false
  if (latin < 4) return false
  return latin >= hebrew * 2 || (latin > 8 && hebrew === 0)
}

/** French-heavy free text (common maintenance / address words). */
export function isPrimarilyFrenchText(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length < 3 || t.length > 500) return false
  const hebrew = (t.match(/[\u0590-\u05FF]/g) || []).length
  if (hebrew >= 3) return false
  if (
    /\b(fuite|probleme|problème|bonjour|merci|adresse|rue|immeuble|appartement|ascenseur|eau|porte|fenêtre|fenetre|urgent|aide)\b/i.test(
      t
    )
  ) {
    return true
  }
  const latin = (t.match(/[a-zA-ZÀ-ÿ]/g) || []).length
  const frenchMarkers = (t.match(/[àâçéèêëîïôùûüœæ]/gi) || []).length
  return latin >= 6 && frenchMarkers >= 1
}

/**
 * Infer resident language from first free-text message.
 * Returns null when ambiguous (show language buttons).
 */
export function inferResidentLanguageFromText(text: string): ResidentLang | null {
  const t = text.trim()
  if (!t || t.length < 2) return null
  if (isPrimarilyFrenchText(t)) return 'fr'
  if (isPrimarilyEnglishText(t)) return 'en'
  const hebrew = (t.match(/[\u0590-\u05FF]/g) || []).length
  if (hebrew >= 2) return 'he'
  const latin = (t.match(/[a-zA-Z]/g) || []).length
  if (latin >= 4 && hebrew === 0) return 'en'
  if (hebrew === 0 && latin === 0) return null
  return 'he'
}

export function isEmojiOnlyOrShortAck(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 12) return false
  if (/^(נ|כן|יאפ|יופי|סגור|👍|✅|🙏|❤️|💙|👌|🙂|😊|😉)+$/u.test(t)) return true
  const withoutSpace = t.replace(/\s/g, '')
  if (!withoutSpace) return false
  // Emoji / symbols only (no letters or digits in any script)
  if (!/[\p{L}\p{N}]/u.test(withoutSpace) && /[^\s]/.test(withoutSpace)) return true
  return false
}

/** Resident tapped confirm or typed yes (he/fr/en). */
export function isTicketConfirmText(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!?.…,:;'"׳״]/g, '')
  if (!t || t.length > 12) return false
  return /^(כן|oui|yes|y|ok|אוקי|אוקיי|okay)$/.test(t)
}

/** How-to / confusion questions — not a ticket description. */
export function isClarificationQuestion(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 200) return false

  if (
    /^(איך|מה לעשות|מה לכתוב|מה כותבים|איך פותחים|איך שולחים|מה שולחים)(\s|$|[?؟])/i.test(t) ||
    /^(comment|quoi faire|que faire|que dois|comment envoyer|comment ouvrir)(\s|$|[?؟])/i.test(t) ||
    /^(how do i|how to|what should i|what do i|how can i)(\s|$|[?؟])/i.test(t)
  ) {
    return true
  }

  if (looksLikeTicketDescription(t)) return false

  if (t.length <= 80 && /\?$/.test(t) && !isStatusQuestion(t)) {
    if (/^(מה|איך|למה|האם)\s/i.test(t)) return true
    if (/^(what|how|why|can i|do i)\s/i.test(t)) return true
    if (/^(quoi|comment|pourquoi|est-ce)\s/i.test(t)) return true
  }

  return false
}

/** True when free text should open a ticket (not greeting, status, etc.). */
export function looksLikeTicketDescription(text: string): boolean {
  const t = text.trim()
  if (!t || t.length < 5) return false
  if (isStatusQuestion(t)) return false
  if (isGreetingSmallTalk(t)) return false
  if (isEmojiOnlyOrShortAck(t)) return false
  if (looksLikePhoneOrNameLine(t)) return false
  return true
}

/** Permissive check once building is identified — minimize back-and-forth. */
export function acceptTicketDescriptionInSession(text: string): boolean {
  const t = text.trim()
  if (!t || t.length < 3) return false
  if (isStatusQuestion(t)) return false
  if (isGreetingSmallTalk(t)) return false
  if (isEmojiOnlyOrShortAck(t)) return false
  if (isAddressLikeTextForTicketGuard(t)) return false
  return true
}

/** Avoid opening a ticket when user repeats a building address in the description step. */
function isAddressLikeTextForTicketGuard(text: string): boolean {
  const t = text.trim()
  if (t.length > 80) return false
  if (!/\d/.test(t)) return false
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length <= 4 && /^(?:רח(?:וב)?|רח׳|בניין|כתובת)/i.test(t)) return true
  return false
}

export function statusLabelHe(status: string): string {
  return ticketStatusLabelHe(status, { feminine: true })
}
