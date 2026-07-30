import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import { markChargePaidByMorningIds } from '@/lib/collection-charge-ops'

/**
 * Morning (Green Invoice) webhook — payment / document events.
 * Configure in Morning: Settings → Webhooks →
 *   callback URL = {APP_URL}/api/webhook/greeninvoice?token={GREENINVOICE_WEBHOOK_SECRET}
 *
 * Morning does not sign webhooks; verify via shared query token.
 * Body may be JSON or application/x-www-form-urlencoded.
 */

function extractIds(payload: unknown): { paymentIds: string[]; documentIds: string[] } {
  const paymentIds: string[] = []
  const documentIds: string[] = []

  if (!payload || typeof payload !== 'object') return { paymentIds, documentIds }
  const obj = payload as Record<string, unknown>

  const pushId = (v: unknown, into: string[]) => {
    if (typeof v === 'string' && v.trim()) into.push(v.trim())
  }

  // payment/receive style
  pushId(obj.id, paymentIds)
  pushId(obj.paymentId, paymentIds)
  pushId(obj.productId, paymentIds)
  pushId(obj.documentId, documentIds)

  if (Array.isArray(obj.transactions)) {
    for (const tx of obj.transactions) {
      if (tx && typeof tx === 'object') {
        pushId((tx as { id?: unknown }).id, paymentIds)
      }
    }
  }

  // document/created style — id is document id; type is numeric doc type
  if (typeof obj.type === 'number' || typeof obj.number === 'number') {
    pushId(obj.id, documentIds)
  }

  // Nested data / body wrappers
  if (obj.data && typeof obj.data === 'object') {
    const nested = extractIds(obj.data)
    paymentIds.push(...nested.paymentIds)
    documentIds.push(...nested.documentIds)
  }

  return { paymentIds, documentIds }
}

async function parsePayload(req: Request): Promise<unknown> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase()
  const rawBody = await req.text()
  if (!rawBody) return null

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(rawBody)
    const asObj: Record<string, string> = {}
    params.forEach((value, key) => {
      asObj[key] = value
    })
    // Morning sometimes puts JSON in a single field
    for (const key of ['payload', 'data', 'json', 'body']) {
      const raw = asObj[key]
      if (raw?.trim().startsWith('{')) {
        try {
          return JSON.parse(raw)
        } catch {
          /* keep form object */
        }
      }
    }
    // Try parse entire values that look like JSON
    for (const value of Object.values(asObj)) {
      if (value.trim().startsWith('{')) {
        try {
          return JSON.parse(value)
        } catch {
          /* ignore */
        }
      }
    }
    return asObj
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    return { raw: rawBody.slice(0, 2000) }
  }
}

function authorizeWebhook(req: Request): boolean {
  const expected = (process.env.GREENINVOICE_WEBHOOK_SECRET || '').trim()
  if (!expected) {
    // Secret not configured — accept (dev / early MVP) but log
    return true
  }
  const url = new URL(req.url)
  const token = (url.searchParams.get('token') || req.headers.get('x-webhook-token') || '').trim()
  return token === expected
}

export async function POST(req: Request) {
  const logger = getLogger()
  try {
    if (!authorizeWebhook(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const payload = await parsePayload(req)
    const ids = extractIds(payload)

    logger.info('WEBHOOK', 'Green Invoice webhook received', {
      paymentIds: ids.paymentIds.slice(0, 5),
      documentIds: ids.documentIds.slice(0, 5),
      payloadPreview:
        typeof payload === 'object' && payload !== null
          ? JSON.stringify(payload).slice(0, 500)
          : String(payload).slice(0, 500),
    })

    const admin = getSupabaseAdmin()
    const { matched } = await markChargePaidByMorningIds(admin, ids)

    // Heuristic: if payment receive has top-level id and no match yet, also try as document id
    if (matched === 0 && ids.paymentIds.length > 0) {
      await markChargePaidByMorningIds(admin, {
        paymentIds: [],
        documentIds: ids.paymentIds,
      })
    }

    return NextResponse.json({ ok: true, matched })
  } catch (e) {
    console.error('[webhook/greeninvoice]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** Some providers verify webhook URL with GET. */
export async function GET(req: Request) {
  if (!authorizeWebhook(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, service: 'greeninvoice-webhook' })
}
