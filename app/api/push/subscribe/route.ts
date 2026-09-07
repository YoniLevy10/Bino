import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { pushSubscribeBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import {
  deleteManagerPushSubscriptionsForUser,
  pushSubscriptionEndpoint,
  upsertExclusiveManagerPushSubscription,
} from '@/lib/push-subscription-tenant'

export async function POST(req: Request) {
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    const { admin, clientId, userId } = auth.ctx
    const rl = await checkAuthenticatedPostRouteLimit(admin, userId, 'push-subscribe')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף לא תקין' }, { status: 400 })
    }

    const parsed = pushSubscribeBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const subscription = parsed.data.subscription as Record<string, unknown>
    const result = await upsertExclusiveManagerPushSubscription(admin, {
      clientId,
      userId,
      subscription,
    })

    if (!result.ok) {
      return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[push/subscribe]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** Remove this user's manager push rows (all tenants) + revoke browser endpoint elsewhere. */
export async function DELETE(req: Request) {
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    const { admin, userId } = auth.ctx
    const rl = await checkAuthenticatedPostRouteLimit(admin, userId, 'push-unsubscribe')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    let endpoint: string | null = null
    try {
      const raw = await req.json()
      if (raw && typeof raw === 'object' && 'subscription' in raw) {
        endpoint = pushSubscriptionEndpoint((raw as { subscription?: unknown }).subscription)
      } else if (raw && typeof raw === 'object' && 'endpoint' in raw) {
        const e = (raw as { endpoint?: unknown }).endpoint
        endpoint = typeof e === 'string' ? e : null
      }
    } catch {
      /* body optional */
    }

    await deleteManagerPushSubscriptionsForUser(admin, { userId, endpoint })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[push/subscribe DELETE]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
