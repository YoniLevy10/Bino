import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { translateTicketBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getLogger } from '@/lib/logging'
import { requireSessionClientId } from '@/lib/api-auth'
import { translateToHebrew } from '@/lib/google-translate'

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `translate-${Date.now()}`
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    let supabaseAdmin
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (e) {
      logger.error('TRANSLATE_API', 'Admin client init failed', e instanceof Error ? e : new Error(String(e)), {
        requestId,
      })
      return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
    }
    const rl = await checkAuthenticatedPostRouteLimit(supabaseAdmin, auth.ctx.userId, 'translate-ticket')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
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

    const translation = await translateToHebrew(text)

    if (!translation) {
      return NextResponse.json({ error: 'לא התקבל תרגום', requestId }, { status: 502 })
    }

    return NextResponse.json({ translation, requestId })
  } catch (e) {
    logger.error('TRANSLATE_API', 'Unhandled error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'שגיאת תרגום — נסו שוב', requestId }, { status: 500 })
  }
}
