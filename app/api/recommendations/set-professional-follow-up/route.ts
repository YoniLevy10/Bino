import { NextResponse } from 'next/server'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { setProfessionalFollowUpBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { recordRecommendationEvent } from '@/lib/recommendations/record-event'

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'recommendations-set-follow-up'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = setProfessionalFollowUpBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }

  const clientId = auth.ctx.clientId
  let followUpIso: string | null = null
  if (parsed.data.follow_up_at) {
    const d = new Date(parsed.data.follow_up_at)
    if (!Number.isFinite(d.getTime())) {
      return NextResponse.json({ error: 'מועד מעקב לא תקין' }, { status: 400 })
    }
    followUpIso = d.toISOString()
  }

  const { data: ticket, error } = await admin
    .from('tickets')
    .update({
      professional_follow_up_at: followUpIso,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.ticket_id)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .select('id, professional_follow_up_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!ticket) return NextResponse.json({ error: 'קריאה לא נמצאה' }, { status: 404 })

  if (parsed.data.recommendation_id) {
    await recordRecommendationEvent(admin, {
      clientId,
      recommendationId: parsed.data.recommendation_id,
      eventType: 'action_chosen',
      actor: auth.ctx.userId,
      meta: {
        action_id: 'set_follow_up',
        follow_up_at: followUpIso,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    ticket_id: ticket.id,
    professional_follow_up_at: ticket.professional_follow_up_at,
  })
}
