import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import { authorizeGrowWebhook, expandBracketFormKeys } from '@/lib/grow-webhook'
import { findChargeIdsByGrowIds } from '@/lib/collection-charge-ops'

async function parsePayload(req: Request): Promise<unknown> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase()
  const rawBody = await req.text()
  if (!rawBody) return null
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    (!contentType.includes('application/json') &&
      rawBody.includes('=') &&
      !rawBody.trimStart().startsWith('{'))
  ) {
    const params = new URLSearchParams(rawBody)
    const asObj: Record<string, string> = {}
    params.forEach((value, key) => {
      asObj[key] = value
    })
    for (const value of Object.values(asObj)) {
      if (value.trim().startsWith('{')) {
        try {
          return JSON.parse(value)
        } catch {
          /* ignore */
        }
      }
    }
    return expandBracketFormKeys(asObj)
  }
  try {
    return JSON.parse(rawBody)
  } catch {
    return { raw: rawBody.slice(0, 2000) }
  }
}

function isAuthorized(req: Request): boolean {
  const url = new URL(req.url)
  return authorizeGrowWebhook({
    expectedSecret: process.env.GROW_WEBHOOK_SECRET,
    tokenFromQuery: url.searchParams.get('token'),
    tokenFromHeader: req.headers.get('x-webhook-token'),
  })
}

function pickStr(rec: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = rec[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'grow-invoice' })
}

export async function POST(req: Request) {
  const logger = getLogger()
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const payload = await parsePayload(req)
    const root =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {}
    const data =
      root.data && typeof root.data === 'object' && !Array.isArray(root.data)
        ? ({ ...root, ...(root.data as Record<string, unknown>) } as Record<string, unknown>)
        : root

    const publicToken = pickStr(data, ['cField1', 'CField1'])
    const processId = pickStr(data, ['processId', 'paymentLinkProcessId'])
    const transactionId = pickStr(data, ['transactionId'])
    const invoiceId = pickStr(data, [
      'invoiceId',
      'documentId',
      'invoice_id',
      'document_id',
      'asmachta',
    ])
    const invoiceUrl = pickStr(data, ['invoiceUrl', 'invoice_url', 'documentUrl', 'url'])

    const admin = getSupabaseAdmin()
    const chargeIds = await findChargeIdsByGrowIds(admin, {
      publicTokens: publicToken ? [publicToken] : [],
      paymentLinkIds: processId ? [processId] : [],
      processIds: processId ? [processId] : [],
      transactionIds: transactionId ? [transactionId] : [],
    })

    logger.info('WEBHOOK', 'Grow invoice webhook', {
      matched: chargeIds.length,
      hasInvoiceId: Boolean(invoiceId),
    })

    if (chargeIds.length === 0) {
      return NextResponse.json({ ok: true, matched: 0 })
    }

    const now = new Date().toISOString()
    await admin
      .from('collection_charges')
      .update({
        grow_invoice_id: invoiceId,
        grow_invoice_url: invoiceUrl,
        grow_invoice_received_at: now,
        updated_at: now,
      })
      .in('id', chargeIds)

    return NextResponse.json({ ok: true, matched: chargeIds.length })
  } catch (e) {
    logger.error('WEBHOOK', 'Grow invoice webhook failed', e instanceof Error ? e : undefined)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
