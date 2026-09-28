const INTERNAL_NOTE_RE =
  /callback|approve|webhook|getlink|userid|sandbox|meshulam|s2s|שלב\s*\d|שרשרת|בדיק|אישור\s*שרת|ארנק\s*sdk|grow\s*sdk/i

function looksInternal(text: string): boolean {
  return INTERNAL_NOTE_RE.test(text)
}

/**
 * Hide internal/ops/test notes from residents on public pay surfaces.
 * Managers may still store notes on the charge; they must not appear on /pay.
 */
export function residentSafeDescription(raw: string | null | undefined): string | null {
  const text = (raw || '').trim()
  if (!text) return null
  if (looksInternal(text)) return null
  return text
}

/** Public charge title — never show internal test labels to residents. */
export function residentSafeTitle(raw: string | null | undefined): string {
  const text = (raw || '').trim()
  if (!text || looksInternal(text)) return 'חיוב לתשלום'
  return text
}
