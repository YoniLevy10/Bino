import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { workerPushSubscribeBodySchema } from '@/lib/api-body-schemas'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'

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
    const row = {
      worker_id: worker.id,
      client_id: worker.client_id,
      subscription,
      updated_at: new Date().toISOString(),
    }

    const { error } = await admin
      .from('worker_push_subscriptions')
      .upsert(row, { onConflict: 'worker_id,client_id' })

    if (error) {
      // Parallel subscribe requests — treat existing row as success
      if (error.code === '23505') {
        return NextResponse.json({ ok: true })
      }
      console.error('[worker/push/subscribe]', error.message, error.code)
      return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[worker/push/subscribe]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
