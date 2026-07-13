import type { ProjectRow } from '@/lib/whatsapp-interactive'

/** Single Hebrew entrance / wing letters often appended after street number. */
const ENTRANCE_SUFFIX = /^[א-ת]$/

const STRIP_WORDS =
  /(?:^|\s)(?:רח(?:וב)?|רח׳|שדר(?:ות)?|שד(?:׳)?|כתובת|בניין|בנין|building|street|st\.?|avenue|ave\.?|road|rd\.?|bldg|entr(?:ance)?|apt|apartment|unit|floor|קומה|דירה|כניסה)(?:\s|$)/gi

/** Normalize Hebrew final forms and strip punctuation for fuzzy compare. */
export function normalizeBuildingSearchText(text: string): string {
  return text
    .trim()
    .replace(STRIP_WORDS, ' ')
    .toLowerCase()
    .replace(/[\u200e\u200f]/g, '')
    .replace(/[׳״"'`,.:;!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ך/g, 'כ')
    .replace(/ם/g, 'מ')
    .replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ')
    .replace(/ץ/g, 'צ')
    .trim()
}

/** Extract trailing entrance letter (e.g. "5 ג" → "ג") for ranking boost. */
export function extractEntranceHint(text: string): string | null {
  const normalized = normalizeBuildingSearchText(text)
  const match = normalized.match(/\d+\s+([א-ת])\b/u) || normalized.match(/\s([א-ת])$/u)
  const letter = match?.[1]
  return letter && ENTRANCE_SUFFIX.test(letter) ? letter : null
}

/** Split query into searchable tokens; drop noise and lone entrance letters. */
export function tokenizeBuildingSearch(text: string): string[] {
  const normalized = normalizeBuildingSearchText(text)
  const raw = normalized.split(/\s+/).filter(Boolean)
  const tokens: string[] = []

  for (const part of raw) {
    if (ENTRANCE_SUFFIX.test(part)) continue
    if (/^\d+[א-ת]?$/.test(part)) {
      const digits = part.replace(/[א-ת]/g, '')
      const letter = part.replace(/\d/g, '')
      if (digits) tokens.push(digits)
      if (letter && !ENTRANCE_SUFFIX.test(letter)) tokens.push(letter)
      continue
    }
    if (part.length >= 2) tokens.push(part)
  }

  return Array.from(new Set(tokens))
}

function projectSearchBlob(project: ProjectRow): string {
  return normalizeBuildingSearchText(
    [project.name, project.address, project.address_en, project.project_code].filter(Boolean).join(' ')
  )
}

/** One-edit typo tolerance for Latin street names (e.g. Helets ↔ Heletz). */
export function isNearTokenMatch(haystack: string, token: string): boolean {
  if (!token || token.length < 5 || /^\d+$/.test(token)) return false
  if (haystack.includes(token)) return true
  const words = haystack.split(/\s+/).filter((w) => w.length >= 4)
  for (const word of words) {
    if (Math.abs(word.length - token.length) > 1) continue
    if (levenshteinDistance(word, token) <= 1) return true
  }
  return false
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = new Array(b.length + 1)
  const curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

function tokenMatchesBlob(blob: string, token: string): boolean {
  return blob.includes(token) || isNearTokenMatch(blob, token)
}

function scoreProjectMatch(project: ProjectRow, tokens: string[], rawQuery: string): number {
  if (tokens.length === 0) return 0
  const blob = projectSearchBlob(project)
  const normalizedQuery = normalizeBuildingSearchText(rawQuery)

  if (blob.includes(normalizedQuery) && normalizedQuery.length >= 3) {
    return 100 + tokens.length
  }

  let score = 0
  for (const token of tokens) {
    if (blob.includes(token)) {
      score += token.length >= 3 ? 10 : 5
    } else if (isNearTokenMatch(blob, token)) {
      score += 8
    }
  }

  const entranceHint = extractEntranceHint(rawQuery)
  if (entranceHint && blob.includes(entranceHint)) score += 15

  // When the resident typed a street-like name, do not match on house number alone.
  const nameTokens = tokens.filter((t) => t.length >= 4 && !/^\d+$/.test(t))
  if (nameTokens.length > 0) {
    const matchedNames = nameTokens.filter((t) => tokenMatchesBlob(blob, t))
    if (matchedNames.length === 0) return 0
    score += matchedNames.length * 5
  }

  // Require at least one "strong" token (3+ chars or digits) to match
  const strongTokens = tokens.filter((t) => t.length >= 3 || /^\d+$/.test(t))
  if (strongTokens.length === 0) return score >= 5 ? score : 0
  const matchedStrong = strongTokens.filter((t) => tokenMatchesBlob(blob, t)).length
  if (matchedStrong === 0) return 0
  if (matchedStrong === strongTokens.length) score += 20
  return score
}

export function rankProjectsByBuildingSearch(
  projects: ProjectRow[],
  searchText: string
): ProjectRow[] {
  const trimmed = searchText.trim()
  if (trimmed.length < 2 || projects.length === 0) return []

  const tokens = tokenizeBuildingSearch(trimmed)
  const scored = projects
    .map((project) => ({
      project,
      score: scoreProjectMatch(project, tokens, trimmed),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return []

  const topScore = scored[0].score
  const top = scored.filter((row) => row.score >= topScore - 5).map((row) => row.project)
  return top.slice(0, 10)
}

export function searchProjectsInList(projects: ProjectRow[], searchText: string): ProjectRow[] {
  return rankProjectsByBuildingSearch(projects, searchText)
}

export function searchProjectsByBuildingFromList(
  allProjects: ProjectRow[],
  searchText: string
): ProjectRow[] {
  return rankProjectsByBuildingSearch(allProjects, searchText)
}
