import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { buildDeterministicGrowthPlan } from '@/lib/growth/brain-plan'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'
import { z } from 'zod'

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const [{ data: goals }, { data: plans }] = await Promise.all([
    auth.ctx.admin
      .from('growth_goals')
      .select('*')
      .eq('organization_id', auth.ctx.organizationId)
      .order('created_at', { ascending: false }),
    auth.ctx.admin
      .from('growth_plans')
      .select('*')
      .eq('organization_id', auth.ctx.organizationId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json({ goals: goals ?? [], plans: plans ?? [] })
}

const createSchema = z.object({
  title: z.string().min(3),
  targetDemos: z.number().int().positive().optional(),
  windowDays: z.number().int().positive().default(14),
  maxBudget: z.number().positive().optional(),
  rawBrief: z.string().optional(),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'growth-goals')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const { data: goal, error: gErr } = await auth.ctx.admin
    .from('growth_goals')
    .insert({
      organization_id: auth.ctx.organizationId,
      brand_id: BAMAKOR_BRAND_ID,
      title: parsed.data.title,
      target_demos: parsed.data.targetDemos ?? null,
      window_days: parsed.data.windowDays,
      max_budget: parsed.data.maxBudget ?? null,
      raw_brief: parsed.data.rawBrief ?? null,
      status: 'planned',
      created_by: auth.ctx.userId,
    })
    .select('*')
    .single()
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

  const planBody = buildDeterministicGrowthPlan({
    title: parsed.data.title,
    targetDemos: parsed.data.targetDemos,
    windowDays: parsed.data.windowDays,
    maxBudget: parsed.data.maxBudget,
  })

  const { data: plan, error: pErr } = await auth.ctx.admin
    .from('growth_plans')
    .insert({
      organization_id: auth.ctx.organizationId,
      goal_id: goal.id,
      version: 1,
      status: 'pending_approval',
      plan: planBody,
      estimated_budget: planBody.estimatedBudget,
    })
    .select('*')
    .single()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'growth.goal.create',
    entityType: 'growth_goal',
    entityId: goal.id,
    after: { planId: plan.id },
  })

  return NextResponse.json({ goal, plan, planBody }, { status: 201 })
}
