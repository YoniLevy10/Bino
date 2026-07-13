import { isAddressLikeText } from '@/lib/whatsapp-parser'
import { normalizeBuildingSearchText } from '@/lib/whatsapp-building-search'

/** Common trailing city names residents append — not part of building search. */
const TRAILING_CITY =
  /\s+(?:חדרה|ת(?:ל|\.)?\s*אביב(?:[\s-]*(?:יפו|yafo))?|ירושלים|חיפה|ב(?:אר|\.)?\s*שבע|נתניה|ראשון[\s-]*לציון|פתח[\s-]*תקו(?:וה|va)|אשדוד|בני[\s-]*ברק|רמת[\s-]*גן|רחובות|כפר[\s-]*סבא|הרצליה|מודיעין|עפולה|אילת|קריית[\s-]*ג(?:ת|at)|קריית[\s-]*מוצקין)\s*\.?\s*$/iu

const TRAILING_THANKS = /\s*(?:תודה(?:\s*רבה)?|thanks|thank\s*you|merci|בבקשה)\s*\.?\s*$/iu

const LEADING_PERSON_NAME =
  /^[\u0590-\u05FFa-zA-Z]{2,14}\s+(?=[\u0590-\u05FFa-zA-Z]+\s+\d)/u

/** Separate attached entrance letter: 5ג → 5 ג */
export function normalizeAttachedEntrance(text: string): string {
  return text.replace(/(\d)([א-ת])(?=\s|$|[.,!])/gu, '$1 $2')
}

function stripNoiseForAddress(text: string): string {
  let t = text.trim()
  t = t.replace(TRAILING_THANKS, '').trim()
  t = t.replace(TRAILING_CITY, '').trim()
  return normalizeAttachedEntrance(t)
}

/** Pull the shortest street+number (+ optional entrance) suffix from a longer message. */
export function extractAddressTail(text: string): string | null {
  const cleaned = stripNoiseForAddress(text)
  for (let wordCount = 1; wordCount <= 3; wordCount++) {
    const pattern = new RegExp(
      `((?:[\\u0590-\\u05FFa-zA-Z'-]+\\s+){${wordCount}}\\d+(?:\\s+[א-ת]|[א-ת])?)\\s*\\.?\\s*$`,
      'u'
    )
    const match = cleaned.match(pattern)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  return null
}

/**
 * Street+number phrases anywhere in the message (not only at the end).
 * Covers English mid-sentence forms like "…lift in Helets 12 is making…".
 */
export function extractInlineAddressPhrases(text: string): string[] {
  const cleaned = stripNoiseForAddress(text)
  const found: string[] = []
  const seen = new Set<string>()

  const add = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length < 2) return
    const key = normalizeBuildingSearchText(trimmed)
    if (!key || seen.has(key)) return
    seen.add(key)
    found.push(trimmed)
  }

  // 1–3 name tokens + house number (+ optional Hebrew entrance letter)
  const pattern =
    /(?:[\u0590-\u05FFa-zA-Z']+\s+){0,2}[\u0590-\u05FFa-zA-Z']+\s+\d+(?:\s*[א-ת])?/gu
  for (const match of cleaned.matchAll(pattern)) {
    add(match[0])
  }

  return found
}

/** Ordered unique search queries — broad first, then narrower extractions. */
export function buildBuildingSearchQueries(raw: string): string[] {
  const queries: string[] = []
  const seen = new Set<string>()

  const add = (value: string) => {
    const trimmed = stripNoiseForAddress(value)
    if (trimmed.length < 2) return
    const key = normalizeBuildingSearchText(trimmed)
    if (!key || seen.has(key)) return
    seen.add(key)
    queries.push(trimmed)
  }

  const cleaned = stripNoiseForAddress(raw)
  add(cleaned)

  const tail = extractAddressTail(cleaned)
  if (tail) add(tail)

  for (const phrase of extractInlineAddressPhrases(cleaned)) {
    add(phrase)
  }

  if (LEADING_PERSON_NAME.test(cleaned)) {
    add(cleaned.replace(LEADING_PERSON_NAME, '').trim())
  }

  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length >= 4) {
    add(words.slice(1).join(' '))
    add(words.slice(2).join(' '))
  }
  if (words.length >= 3) {
    const last3 = words.slice(-3).join(' ')
    if (/\d/.test(last3)) add(last3)
  }
  if (words.length >= 2) {
    const last2 = words.slice(-2).join(' ')
    if (/\d/.test(last2)) add(last2)
  }

  return queries
}

/** True when the message may contain a building address — including mixed problem+address text. */
export function messageContainsBuildingHint(text: string): boolean {
  const t = text.trim()
  if (!t || !/\d/.test(t)) return false
  if (isAddressLikeText(t)) return true
  if (/[\u0590-\u05FF]/.test(t) && t.length >= 6) {
    if (/\d+\s*[א-ת]?/.test(t) || /\d+[א-ת]/.test(t)) return true
  }
  return buildBuildingSearchQueries(t).some((q) => /\d/.test(q) && isAddressLikeText(q))
}
