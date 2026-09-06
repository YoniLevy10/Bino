import { NextResponse } from 'next/server'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { translateToHebrew } from '@/lib/google-translate'

type Body = { token?: unknown; text?: unknown }

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body
    const token = sanitizeId(typeof body.token === 'string' ? body.token : null)
    const text = typeof body.text === 'string' ? body.text.trim() : ''

    if (!token) {
      return NextResponse.json({ error: 'אין גישה' }, { status: 401 })
    }
    if (!text || text.length < 2) {
      return NextResponse.json({ error: 'טקסט קצר מדי' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'אין גישה' }, { status: 401 })
    }

    const translation = await translateToHebrew(text)
    if (!translation) {
      return NextResponse.json({ error: 'לא התקבל תרגום' }, { status: 502 })
    }

    return NextResponse.json({ translation })
  } catch {
    return NextResponse.json({ error: 'שגיאת תרגום' }, { status: 500 })
  }
}
