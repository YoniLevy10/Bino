/** Separator stored in DB between Hebrew and English blocks (shown as one WhatsApp message). */
export const BILINGUAL_TEMPLATE_SEPARATOR = '\n\n———\n\n'

export type BilingualTemplateParts = { he: string; en: string }

/** True when the line likely starts the English block (legacy templates in DB). */
function isLikelyEnglishLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  return /^({{[^}]+}},?\s*)?[A-Za-z❌✅🖼️📍🚨]/.test(t)
}

function splitLegacyBilingual(raw: string): BilingualTemplateParts | null {
  const lines = raw.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!isLikelyEnglishLine(lines[i])) continue
    if (i === 0) continue

    let blankRunStart = i
    while (blankRunStart > 0 && lines[blankRunStart - 1].trim() === '') blankRunStart--
    if (blankRunStart === 0) continue

    const he = lines.slice(0, blankRunStart).join('\n').trim()
    const en = lines.slice(i).join('\n').trim()
    if (he && en) return { he, en }
  }
  return null
}

export function splitBilingualTemplate(text: string): BilingualTemplateParts {
  const raw = text.trim()
  if (!raw) return { he: '', en: '' }

  if (raw.includes(BILINGUAL_TEMPLATE_SEPARATOR)) {
    const idx = raw.indexOf(BILINGUAL_TEMPLATE_SEPARATOR)
    return {
      he: raw.slice(0, idx).trim(),
      en: raw.slice(idx + BILINGUAL_TEMPLATE_SEPARATOR.length).trim(),
    }
  }

  const legacy = splitLegacyBilingual(raw)
  if (legacy) return legacy

  return { he: raw, en: '' }
}

export function joinBilingualTemplate(he: string, en: string): string {
  const h = he.trim()
  const e = en.trim()
  if (!h) return e
  if (!e) return h
  return `${h}${BILINGUAL_TEMPLATE_SEPARATOR}${e}`
}
