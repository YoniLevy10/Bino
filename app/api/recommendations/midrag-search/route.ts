import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { midragSearchOpenedBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { recordRecommendationEvent } from '@/lib/recommendations/record-event'

/**
 * Logs that Midrag was opened as a search only — not a booking / hire.
 */
export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'recommendations-midrag')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = midragSearchOpenedBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }

  const clientId = auth.ctx.clientId
  let recommendationId = parsed.data.recommendation_id ?? null

  // If no recommendation id, still persist a lightweight audit via a synthetic path:
  // insert event only when we have a recommendation_id; otherwise write audit_log-style via events skip
  if (!recommendationId && parsed.data.ticket_id) {
    const { data: rec } = await admin
      .from('management_recommendations')
      .select('id')
      .eq('client_id', clientId)
      .eq('entity_type', 'ticket')
      .eq('entity_id', parsed.data.ticket_id)
      .in('status', ['active', 'snoozed'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    recommendationId = (rec?.id as string | undefined) ?? null
  }

  if (recommendationId) {
    await recordRecommendationEvent(admin, {
      clientId,
      recommendationId,
      eventType: 'midrag_search_opened',
      actor: auth.ctx.userId,
      meta: {
        ticket_id: parsed.data.ticket_id ?? null,
        sector_id: parsed.data.sector_id ?? null,
        city_id: parsed.data.city_id ?? null,
        url: parsed.data.url ?? null,
        // Explicit: search ≠ hire
        is_booking: false,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    recorded: !!recommendationId,
    is_booking: false,
  })
}
