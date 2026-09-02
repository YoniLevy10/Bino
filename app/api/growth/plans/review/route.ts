import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { z } from 'zod'

const bodySchema = z.object({
  planId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'growth-plan-review'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const { data: before } = await auth.ctx.admin
    .from('growth_plans')
    .select('*')
    .eq('id', parsed.data.planId)
    .eq('organization_id', auth.ctx.organizationId)
    .maybeSingle()
  if (!before) return NextResponse.json({ error: 'תוכנית לא נמצאה' }, { status: 404 })

  const { data: plan, error } = await auth.ctx.admin
    .from('growth_plans')
    .update({
      status: parsed.data.decision,
      approved_by: auth.ctx.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.planId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (parsed.data.decision === 'approved') {
    await auth.ctx.admin
      .from('growth_goals')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', before.goal_id)

    const planJson = before.plan as { channels?: Array<{ channel: string; descriptionHe: string }> }
    const tasks = (planJson.channels ?? []).map((ch) => ({
      organization_id: auth.ctx.organizationId,
      goal_id: before.goal_id,
      plan_id: before.id,
      agent: 'growth_brain',
      title: ch.descriptionHe,
      task_type: ch.channel,
      status: 'pending',
      requires_approval: ch.channel === 'meta_ads',
      payload: { channel: ch.channel },
    }))
    if (tasks.length) {
      await auth.ctx.admin.from('growth_tasks').insert(tasks)
    }
  }

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: `growth.plan.${parsed.data.decision}`,
    entityType: 'growth_plan',
    entityId: plan.id,
    before,
    after: plan,
  })

  return NextResponse.json({ plan })
}
