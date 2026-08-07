/**
 * Meta Cloud API rejects template body parameters that contain newlines, tabs,
 * or more than 4 consecutive spaces (errors 100 / 132018).
 */
export function sanitizeWhatsAppTemplateParam(
  raw: string | null | undefined,
  fallback = '—'
): string {
  const cleaned = String(raw ?? '')
    .replace(/\r\n|\r|\n|\t/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim()
  // Meta rejects empty variable values.
  return cleaned || fallback
}

export function sanitizeWhatsAppTemplateParams(
  params: Array<string | null | undefined>,
  fallback = '—'
): string[] {
  return params.map((p) => sanitizeWhatsAppTemplateParam(p, fallback))
}
