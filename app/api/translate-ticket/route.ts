import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { translateTicketBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getLogger } from '@/lib/logging'
import { requireSessionClientId } from '@/lib/api-auth'

async function googleTranslate(text: string): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=he&dt=t&q=` +
    encodeURIComponent(text)
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`)
  // Response: [ [ ["translated","original",...], ... ], null, "detected_lang" ]
  const data = (await res.json()) as unknown[][]
  const segments = data[0] as unknown[][]
  return segments.map((s) => String((s as unknown[])[0] ?? '')).join('').trim()
}

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

    const translation = await googleTranslate(text)

    if (!translation) {
      return NextResponse.json({ error: 'לא התקבל תרגום', requestId }, { status: 502 })
    }

    return NextResponse.json({ translation, requestId })
  } catch (e) {
    logger.error('TRANSLATE_API', 'Unhandled error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'שגיאת תרגום — נסו שוב', requestId }, { status: 500 })
  }
}
