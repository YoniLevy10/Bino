import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'
import { verdictForArms } from '@/lib/growth/experiments/verdict'
import { z } from 'zod'

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const { data: experiments, error } = await auth.ctx.admin
    .from('growth_experiments')
    .select('*, growth_experiment_arms(*)')
    .eq('organization_id', auth.ctx.organizationId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ experiments: experiments ?? [] })
}

const createSchema = z.object({
  name: z.string().min(3),
  hypothesis: z.string().min(5),
  primaryMetric: z.string().default('qualified_demo_rate'),
  audience: z.string().optional(),
  budgetTotal: z.number().positive().optional(),
  arms: z
    .array(
      z.object({
        name: z.string(),
        variantKey: z.string(),
        description: z.string().optional(),
      })
    )
    .min(2),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'growth-experiments'
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
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const { data: experiment, error } = await auth.ctx.admin
    .from('growth_experiments')
    .insert({
      organization_id: auth.ctx.organizationId,
      brand_id: BAMAKOR_BRAND_ID,
      name: parsed.data.name,
      hypothesis: parsed.data.hypothesis,
      primary_metric: parsed.data.primaryMetric,
      audience: parsed.data.audience ?? null,
      budget_total: parsed.data.budgetTotal ?? null,
      status: 'draft',
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const share = Math.round((100 / parsed.data.arms.length) * 100) / 100
  const { data: arms, error: aErr } = await auth.ctx.admin
    .from('growth_experiment_arms')
    .insert(
      parsed.data.arms.map((a) => ({
        experiment_id: experiment.id,
        name: a.name,
        variant_key: a.variantKey,
        description: a.description ?? null,
        budget_share: share,
      }))
    )
    .select('*')
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'growth.experiment.create',
    entityType: 'growth_experiment',
    entityId: experiment.id,
  })

  return NextResponse.json({ experiment, arms, noteHe: 'טיוטת ניסוי — לא הושק אוטומטית' }, { status: 201 })
}

/** Evaluate draft metrics payload (no spend authority). */
export async function PUT(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const schema = z.object({
    arms: z.array(
      z.object({
        key: z.string(),
        metrics: z.object({
          spend: z.number(),
          leads: z.number(),
          qualified: z.number(),
          demos: z.number(),
        }),
      })
    ),
  })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }
  return NextResponse.json({ result: verdictForArms(parsed.data.arms) })
}
