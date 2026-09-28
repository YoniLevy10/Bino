import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import { authorizeGrowWebhook, expandBracketFormKeys } from '@/lib/grow-webhook'
import { extractGrowRegisterWebhook } from '@/lib/grow-register'
import { findOtherClientUsingGrowUserId, normalizeGrowUserId } from '@/lib/grow-credentials'

/**
 * Grow merchant registration webhook (GetLink completion).
 *
 * Auth: shared `GROW_WEBHOOK_SECRET` as `?token=` — Grow must point the marketer
 * webhook to this URL. Grow docs do not document an alternate signature scheme.
 * Binding: `tracking_code` must match `clients.grow_encrypted_lead`.
 */
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

export async function GET() {
  return NextResponse.json({ ok: true, route: 'grow-register' })
}

export async function POST(req: Request) {
  const logger = getLogger()
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const payload = await parsePayload(req)
    const parsed = extractGrowRegisterWebhook(payload)
    logger.info('WEBHOOK', 'Grow register webhook', {
      hasTracking: Boolean(parsed.trackingCode),
      approved: parsed.approved,
      rejected: parsed.rejected,
      hasUserId: Boolean(parsed.userId),
    })

    if (!parsed.trackingCode) {
      return NextResponse.json({ ok: true, matched: 0, reason: 'no_tracking_code' })
    }

    const admin = getSupabaseAdmin()
    const { data: client, error } = await admin
      .from('clients')
      .select('id, grow_user_id, grow_enabled, grow_legal_business_name')
      .eq('grow_encrypted_lead', parsed.trackingCode)
      .maybeSingle()

    if (error || !client) {
      logger.info('WEBHOOK', 'Grow register: no client for tracking_code')
      return NextResponse.json({ ok: true, matched: 0, reason: 'unknown_lead' })
    }

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      updated_at: now,
      grow_onboarding_phone: parsed.phone || undefined,
      grow_package_name: parsed.packageName || undefined,
    }

    if (parsed.rejected) {
      patch.grow_onboarding_status = 'rejected'
      await admin.from('clients').update(patch).eq('id', client.id)
      return NextResponse.json({ ok: true, matched: 1, status: 'rejected' })
    }

    if (parsed.approved && parsed.userId) {
      const userId = normalizeGrowUserId(parsed.userId)
      if (!userId) {
        return NextResponse.json({ ok: true, matched: 1, status: 'missing_user_id' })
      }
      const conflict = await findOtherClientUsingGrowUserId(admin, userId, client.id)
      if (conflict) {
        logger.info('WEBHOOK', 'Grow register userId conflict', { clientId: client.id })
        await admin
          .from('clients')
          .update({
            grow_onboarding_status: 'error',
            updated_at: now,
          })
          .eq('id', client.id)
        return NextResponse.json({ ok: true, matched: 1, status: 'user_id_conflict' })
      }

      patch.grow_user_id = userId
      patch.grow_enabled = true
      patch.grow_onboarding_status = 'approved'
      patch.grow_onboarding_completed_at = now
      if (parsed.businessTitle && !client.grow_legal_business_name) {
        patch.grow_legal_business_name = parsed.businessTitle.slice(0, 120)
      }
      // Do NOT store Grow merchant api_key from webhook into platform env — tenant
      // money uses platform apiKey + tenant userId per PAYMENTS.md model.

      await admin.from('clients').update(patch).eq('id', client.id)
      return NextResponse.json({ ok: true, matched: 1, status: 'approved' })
    }

    await admin
      .from('clients')
      .update({
        grow_onboarding_status: parsed.trackingStatusId
          ? `status_${parsed.trackingStatusId}`
          : 'pending',
        updated_at: now,
      })
      .eq('id', client.id)

    return NextResponse.json({ ok: true, matched: 1, status: 'pending' })
  } catch (e) {
    logger.error('WEBHOOK', 'Grow register webhook failed', e instanceof Error ? e : undefined)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
