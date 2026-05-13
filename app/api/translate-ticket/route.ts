import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { translateTicketBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getLogger } from '@/lib/logging'
import { requireSessionClientId } from '@/lib/api-auth'

type MyMemoryResponse = {
  responseData?: { translatedText?: string }
  responseStatus?: number
}

function detectLangPair(text: string): string {
  if (/[Ѐ-ӿ]/.test(text)) return 'ru|he'   // Cyrillic → Russian
  if (/[؀-ۿ]/.test(text)) return 'ar|he'   // Arabic
  if (/[一-鿿]/.test(text)) return 'zh|he'   // Chinese
  return 'en|he'                                       // default: English
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

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${detectLangPair(text)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      return NextResponse.json({ error: 'שגיאת תרגום — נסו שוב', requestId }, { status: 502 })
    }
    const data = (await res.json()) as MyMemoryResponse
    const translation = data?.responseData?.translatedText?.trim() ?? ''

    if (!translation) {
      return NextResponse.json({ error: 'לא התקבל תרגום', requestId }, { status: 502 })
    }

    return NextResponse.json({ translation, requestId })
  } catch (e) {
    logger.error('TRANSLATE_API', 'Unhandled error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'שגיאת תרגום — נסו שוב', requestId }, { status: 500 })
  }
}
