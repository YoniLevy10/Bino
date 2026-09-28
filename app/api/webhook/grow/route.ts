import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import { markChargePaidByGrowIds } from '@/lib/collection-charge-ops'
import { approveGrowTransaction } from '@/lib/grow-client'
import { readGrowPlatformConfig } from '@/lib/grow-config'
import {
  authorizeGrowWebhook,
  expandBracketFormKeys,
  extractGrowWebhookIds,
} from '@/lib/grow-webhook'

async function parsePayload(req: Request): Promise<unknown> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase()
  const rawBody = await req.text()
  if (!rawBody) return null

  // Grow S2S: application/x-www-form-urlencoded with data[field] keys (verified via updateMyUrl).
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    (!contentType.includes('application/json') &&
      !contentType.includes('multipart/') &&
      rawBody.includes('=') &&
      !rawBody.trimStart().startsWith('{'))
  ) {
    const params = new URLSearchParams(rawBody)
    const asObj: Record<string, string> = {}
    params.forEach((value, key) => {
      asObj[key] = value
    })
    // Prefer expanded bracket tree; also keep JSON blobs if a single field holds JSON.
    const expanded = expandBracketFormKeys(asObj)
    for (const value of Object.values(asObj)) {
      if (value.trim().startsWith('{')) {
        try {
          return JSON.parse(value)
        } catch {
          /* ignore */
        }
      }
    }
    return expanded
  }

  if (contentType.includes('multipart/form-data')) {
    // Rare; reconstruct from raw is hard — callers should use urlencoded.
    // Fall through: try JSON, else return raw marker for logs.
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    return { raw: rawBody.slice(0, 2000) }
  }
}

function isAuthorized(req: Request): boolean {
  const url = new URL(req.url)
  const platform = readGrowPlatformConfig()
  return authorizeGrowWebhook({
    expectedSecret: platform?.webhookSecret || process.env.GROW_WEBHOOK_SECRET,
    tokenFromQuery: url.searchParams.get('token'),
    tokenFromHeader: req.headers.get('x-webhook-token'),
  })
}

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const logger = getLogger()
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const payload = await parsePayload(req)
    const ids = extractGrowWebhookIds(payload)

    logger.info('WEBHOOK', 'Grow webhook received', {
      paid: ids.paid,
      paymentLinkIds: ids.paymentLinkIds.slice(0, 5),
      transactionIds: ids.transactionIds.slice(0, 5),
      hasSum: Boolean(ids.sum),
    })

    if (!ids.paid) {
      return NextResponse.json({ ok: true, matched: 0, ignored: true })
    }

    const admin = getSupabaseAdmin()
    const result = await markChargePaidByGrowIds(admin, ids)

    // Always attempt approve when Grow sent transaction ids — also covers Grow retries
    // after a prior mark-paid where approve previously failed.
    if (ids.transactionIds[0] && ids.transactionToken) {
      const approved = await approveGrowTransaction({
        transactionId: ids.transactionIds[0],
        transactionToken: ids.transactionToken,
        transactionTypeId: ids.transactionTypeId || undefined,
        paymentType: ids.paymentType || undefined,
      })
      if (!approved.ok) {
        logger.info('WEBHOOK', 'Grow approveTransaction did not confirm — charge kept paid for retry', {
          transactionId: ids.transactionIds[0],
          matched: result.matched,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      matched: result.matched,
      sumRejected: result.sumRejected,
    })
  } catch (e) {
    logger.error('WEBHOOK', 'Grow webhook failed', e instanceof Error ? e : undefined)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
