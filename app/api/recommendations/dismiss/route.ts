import { NextResponse } from 'next/server'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { dismissRecommendationBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { recordRecommendationEvent } from '@/lib/recommendations/record-event'

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'recommendations-dismiss')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = dismissRecommendationBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }

  const clientId = auth.ctx.clientId
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('management_recommendations')
    .update({
      status: 'irrelevant',
      acted_by: auth.ctx.userId,
      acted_at: now,
      updated_at: now,
      resolution_source: 'user_dismiss',
    })
    .eq('id', parsed.data.id)
    .eq('client_id', clientId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'המלצה לא נמצאה' }, { status: 404 })

  await recordRecommendationEvent(admin, {
    clientId,
    recommendationId: parsed.data.id,
    eventType: 'dismissed',
    actor: auth.ctx.userId,
  })

  return NextResponse.json({ ok: true, id: data.id })
}
