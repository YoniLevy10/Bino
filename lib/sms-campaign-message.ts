/** Strip emoji and non-019-safe chars for SMS campaigns (019SMS fails on emoji). */
export function sanitizeSmsCampaignBody(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function validateSmsCampaignBody(text: string): string | null {
  const cleaned = sanitizeSmsCampaignBody(text)
  if (!cleaned) return 'הודעה ריקה אחרי ניקוי (אין אימוג׳י ב-SMS)'
  if (cleaned.length > 900) return 'הודעה ארוכה מדי (מקס 900 תווים)'
  return null
}
