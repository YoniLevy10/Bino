/** Strip emoji and non-019-safe chars for SMS (019SMS fails on emoji). Preserves newlines for structured digests. */
export function sanitizeSmsCampaignBody(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function validateSmsCampaignBody(text: string): string | null {
  const cleaned = sanitizeSmsCampaignBody(text)
  if (!cleaned) return 'הודעה ריקה אחרי ניקוי (אין אימוג׳י ב-SMS)'
  if (cleaned.length > 900) return 'הודעה ארוכה מדי (מקס 900 תווים)'
  return null
}
