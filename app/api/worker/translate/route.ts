import { NextResponse } from 'next/server'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { fetchWithTimeout } from '@/lib/fetch-timeout'

async function googleTranslate(text: string): Promise<string | null> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=he&dt=t&q=` +
    encodeURIComponent(text)
  const res = await fetchWithTimeout(url, {}, 8000)
  if (!res || !res.ok) return null
  const data = (await res.json()) as unknown[][]
  const segments = data[0] as unknown[][]
  return segments.map((s) => String((s as unknown[])[0] ?? '')).join('').trim()
}

type Body = { token?: unknown; text?: unknown }

export async function POST(req: Request) {
  try {
    let admin
    try {
      admin = getSupabaseAdmin()
    } catch {
      return NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 })
    }

    const ipFwd =
      (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() ||
      (req as Request & { ip?: string }).ip ||
      'unknown'
    const rl = await checkIpPostRouteLimit(admin, ipFwd, 'worker-translate')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות, נסה שוב בעוד דקה' }, { status: 429 })
    }

    const body = (await req.json()) as Body
    const token = sanitizeId(typeof body.token === 'string' ? body.token : null)
    const text = typeof body.text === 'string' ? body.text.trim() : ''

    if (!token) {
      return NextResponse.json({ error: 'אין גישה' }, { status: 401 })
    }
    if (!text || text.length < 2) {
      return NextResponse.json({ error: 'טקסט קצר מדי' }, { status: 400 })
    }
    if (text.length > 4000) {
      return NextResponse.json({ error: 'טקסט ארוך מדי' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'אין גישה' }, { status: 401 })
    }

    const translation = await googleTranslate(text)
    if (!translation) {
      return NextResponse.json({ error: 'לא התקבל תרגום' }, { status: 502 })
    }

    return NextResponse.json({ translation })
  } catch {
    return NextResponse.json({ error: 'שגיאת תרגום' }, { status: 500 })
  }
}
