import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { z } from 'zod'

export async function GET(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const objectiveId = new URL(req.url).searchParams.get('objectiveId')
  let q = auth.ctx.admin
    .from('mbrain_strategies')
    .select('id, brand_id, objective_id, version, status, plan, model_provider, model_name, generation_cost_usd, created_at')
    .eq('organization_id', auth.ctx.organizationId)
    .order('created_at', { ascending: false })
  if (objectiveId) q = q.eq('objective_id', objectiveId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ strategies: data ?? [] })
}

const reviewSchema = z.object({
  strategyId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'mbrain-strategy-review')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const { data: before } = await auth.ctx.admin
    .from('mbrain_strategies')
    .select('*')
    .eq('id', parsed.data.strategyId)
    .eq('organization_id', auth.ctx.organizationId)
    .maybeSingle()

  if (!before) return NextResponse.json({ error: 'אסטרטגיה לא נמצאה' }, { status: 404 })

  const { data: strategy, error } = await auth.ctx.admin
    .from('mbrain_strategies')
    .update({
      status: parsed.data.decision,
      reviewed_by: auth.ctx.userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.strategyId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (parsed.data.decision === 'approved') {
    await auth.ctx.admin
      .from('mbrain_marketing_objectives')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', before.objective_id)
  }

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: `strategy.${parsed.data.decision}`,
    entityType: 'strategy',
    entityId: strategy.id,
    before,
    after: strategy,
  })

  return NextResponse.json({ strategy })
}
