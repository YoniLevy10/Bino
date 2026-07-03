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
    [project.name, project.address, project.project_code].filter(Boolean).join(' ')
  )
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
    if (blob.includes(token)) score += token.length >= 3 ? 10 : 5
  }

  const entranceHint = extractEntranceHint(rawQuery)
  if (entranceHint && blob.includes(entranceHint)) score += 15

  // Require at least one "strong" token (3+ chars or digits) to match
  const strongTokens = tokens.filter((t) => t.length >= 3 || /^\d+$/.test(t))
  if (strongTokens.length === 0) return score >= 5 ? score : 0
  const matchedStrong = strongTokens.filter((t) => blob.includes(t)).length
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
