import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { translateTicketBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getLogger } from '@/lib/logging'
import { requireSessionClientId } from '@/lib/api-auth'

const client = new Anthropic()

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `translate-${Date.now()}`
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    try {
      const supabaseAdmin = getSupabaseAdmin()
      const rl = await checkAuthenticatedPostRouteLimit(supabaseAdmin, auth.ctx.userId, 'translate-ticket')
      if (rl.isLimited) {
        return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
      }
    } catch (e) {
      logger.warn('TRANSLATE_API', 'Rate limit check skipped', {
        requestId,
        error: e instanceof Error ? e.message : String(e),
      })
    }

    const rawBody = await req.json()
    const validated = translateTicketBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }
    const text = validated.data.text.trim()

    if (!text || text.length < 2) {
      return NextResponse.json({ error: 'טקסט ריק', requestId }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: 'אתה מתרגם מקצועי. תרגם את הטקסט לעברית בלבד, ללא הסברים נוספים.',
      messages: [{ role: 'user', content: text }],
    })

    const block = message.content[0]
    const translation = block?.type === 'text' ? block.text.trim() : ''

    if (!translation) {
      return NextResponse.json({ error: 'לא התקבל תרגום', requestId }, { status: 502 })
    }

    return NextResponse.json({ translation, requestId })
  } catch (e) {
    logger.error('TRANSLATE_API', 'Unhandled error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'שגיאת תרגום — נסו שוב', requestId }, { status: 500 })
  }
}
