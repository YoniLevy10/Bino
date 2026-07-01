/** Separator stored in DB between language blocks (shown as one WhatsApp message). */
export const BILINGUAL_TEMPLATE_SEPARATOR = '\n\n———\n\n'

export type TrilingualTemplateParts = { he: string; fr: string; en: string }

/** @deprecated use TrilingualTemplateParts — kept for existing imports */
export type BilingualTemplateParts = TrilingualTemplateParts

/** True when the line likely starts a Latin-script block (legacy HE+EN templates in DB). */
function isLikelyLatinLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  return /^({{[^}]+}},?\s*)?[A-Za-zÀ-ÿ❌✅🖼️📍🚨]/.test(t)
}

function splitLegacyBilingual(raw: string): TrilingualTemplateParts | null {
  const lines = raw.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!isLikelyLatinLine(lines[i])) continue
    if (i === 0) continue

    let blankRunStart = i
    while (blankRunStart > 0 && lines[blankRunStart - 1].trim() === '') blankRunStart--
    if (blankRunStart === 0) continue

    const he = lines.slice(0, blankRunStart).join('\n').trim()
    const en = lines.slice(i).join('\n').trim()
    if (he && en) return { he, fr: '', en }
  }
  return null
}

export function splitTrilingualTemplate(text: string): TrilingualTemplateParts {
  const raw = text.trim()
  if (!raw) return { he: '', fr: '', en: '' }

  if (raw.includes(BILINGUAL_TEMPLATE_SEPARATOR)) {
    const parts = raw.split(BILINGUAL_TEMPLATE_SEPARATOR).map((p) => p.trim())
    if (parts.length >= 3) {
      return { he: parts[0], fr: parts[1], en: parts.slice(2).join(BILINGUAL_TEMPLATE_SEPARATOR).trim() }
    }
    if (parts.length === 2) {
      return { he: parts[0], fr: '', en: parts[1] }
    }
    return { he: parts[0] ?? '', fr: '', en: '' }
  }

  const legacy = splitLegacyBilingual(raw)
  if (legacy) return legacy

  return { he: raw, fr: '', en: '' }
}

/** @deprecated use splitTrilingualTemplate */
export const splitBilingualTemplate = splitTrilingualTemplate

export function joinTrilingualTemplate(he: string, fr: string, en: string): string {
  const blocks = [he.trim(), fr.trim(), en.trim()].filter((b) => b.length > 0)
  return blocks.join(BILINGUAL_TEMPLATE_SEPARATOR)
}

/** @deprecated use joinTrilingualTemplate */
export function joinBilingualTemplate(he: string, en: string): string {
  return joinTrilingualTemplate(he, '', en)
}
