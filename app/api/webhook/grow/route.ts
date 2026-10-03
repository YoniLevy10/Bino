import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import {
  findChargeIdsByGrowIds,
  markChargePaidByGrowIds,
  persistGrowTransactionIds,
  preflightGrowWebhookSumCheck,
  recordGrowApproveResult,
} from '@/lib/collection-charge-ops'
import { approveGrowTransaction } from '@/lib/grow-client'
import { readGrowPlatformConfig } from '@/lib/grow-config'
import {
  authorizeGrowWebhook,
  expandBracketFormKeys,
  extractGrowWebhookIds,
} from '@/lib/grow-webhook'
import { notifyPlatformOps } from '@/lib/platform-ops-alert'

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

    // Resolve candidates first so sum-reject / cancel can short-circuit before Approve.
    const chargeIds = await findChargeIdsByGrowIds(admin, {
      publicTokens: ids.publicTokens,
      paymentLinkIds: ids.paymentLinkIds,
      processIds: ids.processIds,
      transactionIds: ids.transactionIds,
    })

    // H2: amount/sum check BEFORE ApproveTransaction (never Approve a mismatched sum).
    const sumPreflight = await preflightGrowWebhookSumCheck(admin, {
      publicTokens: ids.publicTokens,
      paymentLinkIds: ids.paymentLinkIds,
      processIds: ids.processIds,
      sum: ids.sum,
    })
    if (sumPreflight.unpaidCount > 0 && sumPreflight.sumOkIds.length === 0) {
      logger.info('WEBHOOK', 'Grow webhook sum mismatch — skipping Approve and mark paid', {
        unpaidCount: sumPreflight.unpaidCount,
        sumRejected: sumPreflight.sumRejected,
      })
      return NextResponse.json({
        ok: false,
        matched: 0,
        sumRejected: sumPreflight.sumRejected,
        reason: 'sum_mismatch',
      })
    }

    const needsApprove = Boolean(ids.transactionIds[0] && ids.transactionToken)
    // Prefer known charge ids (incl. already-paid for Grow retry ack); fall back to sum-ok unpaid.
    const approveChargeIds =
      chargeIds.length > 0 ? chargeIds : sumPreflight.sumOkIds

    // H3: Approve BEFORE marking paid whenever credentials exist. No secondary paid-then-Approve path.
    if (needsApprove && approveChargeIds.length > 0) {
      const approved = await approveGrowTransaction({
        transactionId: ids.transactionIds[0],
        transactionToken: ids.transactionToken!,
        transactionTypeId: ids.transactionTypeId || undefined,
        paymentType: ids.paymentType || undefined,
      })
      await recordGrowApproveResult(admin, {
        chargeIds: approveChargeIds,
        ok: approved.ok,
        error: approved.error,
        transactionId: ids.transactionIds[0],
        transactionToken: ids.transactionToken,
      })
      if (!approved.ok) {
        logger.info('WEBHOOK', 'Grow approveTransaction failed — not marking paid', {
          transactionId: ids.transactionIds[0],
          error: approved.error,
        })
        void notifyPlatformOps({
          kind: 'operational_error',
          title: 'Grow ApproveTransaction נכשל',
          message: approved.error || 'ApproveTransaction failed — charge not marked paid',
          details: {
            reason: 'grow_approve_failed',
            transactionId: ids.transactionIds[0],
            chargeIds: approveChargeIds.slice(0, 10),
          },
        })
        return NextResponse.json(
          {
            ok: false,
            matched: 0,
            approveFailed: true,
            error: approved.error || 'approve_failed',
          },
          { status: 502 }
        )
      }
    }

    const result = await markChargePaidByGrowIds(admin, ids)

    // Defense in depth: markChargePaid also sum-checks; refuse persist if all rejected.
    if (result.sumRejected > 0 && result.matched === 0) {
      return NextResponse.json({
        ok: false,
        matched: 0,
        sumRejected: result.sumRejected,
        reason: 'sum_mismatch',
      })
    }

    const targetIds = result.newlyPaidIds.length
      ? result.newlyPaidIds
      : chargeIds.filter(Boolean)

    if (targetIds.length > 0) {
      await persistGrowTransactionIds(admin, {
        chargeIds: targetIds,
        transactionId: ids.transactionIds[0] || null,
        transactionToken: ids.transactionToken,
      })
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
