/**
 * AI-powered WhatsApp response generator.
 * Enabled by setting WHATSAPP_AI_ENABLED=true + ANTHROPIC_API_KEY in env.
 * Falls back gracefully to the interpolated template on any error.
 */
import Anthropic from '@anthropic-ai/sdk'
import { interpolateWhatsAppTemplate } from '@/lib/whatsapp-templates'

const SYSTEM_PROMPT = `אתה עוזר WhatsApp של מערכת ניהול בניינים בישראל.
תפקידך לשלוח הודעות קצרות, ידידותיות ומקצועיות לדיירים בעברית.
כללים:
- עברית בלבד
- מקסימום 4 משפטים
- שמור על כל הפרטים החשובים מהתבנית (מספר תקלה, שם פרויקט וכו')
- אל תוסיף ברכות ארוכות
- אמוג'י — רק אם הם בתבנית המקורית`

export async function generateAIWhatsAppResponse(
  templateText: string,
  vars: Record<string, string>,
  context?: { situation?: string }
): Promise<string> {
  const fallback = interpolateWhatsAppTemplate(templateText, vars)

  if (process.env.WHATSAPP_AI_ENABLED !== 'true') return fallback

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fallback

  try {
    const client = new Anthropic({ apiKey })
    const interpolated = fallback

    const userPrompt =
      `צור הודעת WhatsApp טבעית ויפה למצב הזה.\n` +
      (context?.situation ? `מצב: ${context.situation}\n` : '') +
      `תבנית בסיסית:\n${interpolated}\n\n` +
      `החזר רק את טקסט ההודעה, ללא הסברים.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const content = message.content[0]
    if (content?.type === 'text' && content.text.trim()) {
      return content.text.trim()
    }
  } catch (e) {
    console.warn('[whatsapp-ai] AI generation failed, using template fallback:', e instanceof Error ? e.message : String(e))
  }

  return fallback
}
