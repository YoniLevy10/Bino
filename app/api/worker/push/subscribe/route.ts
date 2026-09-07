import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import {
  workerPushSubscribeBodySchema,
  workerPushUnsubscribeBodySchema,
} from '@/lib/api-body-schemas'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import {
  deleteWorkerPushSubscriptionsForWorker,
  pushSubscriptionEndpoint,
  upsertExclusiveWorkerPushSubscription,
} from '@/lib/push-subscription-tenant'

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: Request) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-push-subscribe')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף לא תקין' }, { status: 400 })
    }

    const parsed = workerPushSubscribeBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const token = sanitizeId(parsed.data.token)
    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'אין גישה' }, { status: 401 })
    }

    const subscription = parsed.data.subscription as Record<string, unknown>
    const result = await upsertExclusiveWorkerPushSubscription(admin, {
      clientId: worker.client_id,
      workerId: worker.id,
      subscription,
    })

    if (!result.ok) {
      console.error('[worker/push/subscribe]', result.error)
      return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[worker/push/subscribe]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** Remove this worker's push rows for the tenant + revoke browser endpoint elsewhere. */
export async function DELETE(req: Request) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-push-unsubscribe')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף לא תקין' }, { status: 400 })
    }

    const parsed = workerPushUnsubscribeBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const token = sanitizeId(parsed.data.token)
    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'אין גישה' }, { status: 401 })
    }

    const endpoint = parsed.data.subscription
      ? pushSubscriptionEndpoint(parsed.data.subscription)
      : typeof parsed.data.endpoint === 'string'
        ? parsed.data.endpoint.trim() || null
        : null

    await deleteWorkerPushSubscriptionsForWorker(admin, {
      workerId: worker.id,
      clientId: worker.client_id,
      endpoint,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[worker/push/subscribe DELETE]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
