import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import {
  findChargeIdsByGrowIds,
  markChargePaidByGrowIds,
  persistGrowTransactionIds,
  recordGrowApproveResult,
} from '@/lib/collection-charge-ops'
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
      processIds: ids.processIds.slice(0, 5),
      transactionIds: ids.transactionIds.slice(0, 5),
      hasSum: Boolean(ids.sum),
    })

    if (!ids.paid) {
      return NextResponse.json({ ok: true, matched: 0, ignored: true })
    }

    const admin = getSupabaseAdmin()
    const result = await markChargePaidByGrowIds(admin, ids)

    const chargeIds = await findChargeIdsByGrowIds(admin, {
      publicTokens: ids.publicTokens,
      paymentLinkIds: ids.paymentLinkIds,
      processIds: ids.processIds,
      transactionIds: ids.transactionIds,
    })
    const targetIds = chargeIds.length ? chargeIds : result.newlyPaidIds

    await persistGrowTransactionIds(admin, {
      chargeIds: targetIds,
      transactionId: ids.transactionIds[0] || null,
      transactionToken: ids.transactionToken,
    })

    if (ids.transactionIds[0] && ids.transactionToken) {
      const approved = await approveGrowTransaction({
        transactionId: ids.transactionIds[0],
        transactionToken: ids.transactionToken,
        transactionTypeId: ids.transactionTypeId || undefined,
        paymentType: ids.paymentType || undefined,
      })
      await recordGrowApproveResult(admin, {
        chargeIds: targetIds,
        ok: approved.ok,
        error: approved.error,
        transactionId: ids.transactionIds[0],
        transactionToken: ids.transactionToken,
      })
      if (!approved.ok) {
        logger.info('WEBHOOK', 'Grow approveTransaction failed — charge kept paid for retry', {
          transactionId: ids.transactionIds[0],
          matched: result.matched,
          error: approved.error,
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
