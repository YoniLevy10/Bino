import { NextResponse } from 'next/server'
import { readIcountWebhookSecret } from '@/lib/icount-config'

export const runtime = 'nodejs'

/**
 * iCount IPN / webhook stub for dual-run collections.
 * Acknowledges authenticated callbacks but does NOT mark charges paid yet.
 * Wire createIcountPayLink + mark-paid in a follow-up after pilot credentials.
 */
function authorize(req: Request): boolean {
  const secret = readIcountWebhookSecret()
  if (!secret) return false
  const url = new URL(req.url)
  const token = (url.searchParams.get('token') || '').trim()
  return token.length > 0 && token === secret
}

async function handle(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown = null
  try {
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      body = await req.json().catch(() => null)
    } else {
      const text = await req.text().catch(() => '')
      body = text ? { raw: text.slice(0, 4000) } : null
    }
  } catch {
    body = null
  }

  console.info('[webhook/icount] stub received (not marking paid)', {
    method: req.method,
    hasBody: body != null,
  })

  return NextResponse.json({
    ok: true,
    status: 'stub',
    message:
      'iCount webhook stub — charge mark-paid not wired yet. Keep Grow path until P0.',
  })
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}
