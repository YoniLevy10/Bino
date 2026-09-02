import { NextResponse } from 'next/server'
import { assertBrandInOrg, requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { marketingObjectiveInputSchema } from '@/lib/mbrain/strategy-schema'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { evaluateBudgetAgainstGuardrails, type Guardrails } from '@/lib/mbrain/guardrails'

export async function GET(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const brandId = new URL(req.url).searchParams.get('brandId')
  let q = auth.ctx.admin
    .from('mbrain_marketing_objectives')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .order('created_at', { ascending: false })

  if (brandId) q = q.eq('brand_id', brandId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ objectives: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'mbrain-objectives')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const parsed = marketingObjectiveInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין', details: parsed.error.flatten() }, { status: 400 })
  }

  const ok = await assertBrandInOrg(auth.ctx.admin, auth.ctx.organizationId, parsed.data.brandId)
  if (!ok) return NextResponse.json({ error: 'מותג לא נמצא' }, { status: 404 })

  const { data: guardrailRow } = await auth.ctx.admin
    .from('mbrain_spending_guardrails')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('brand_id', parsed.data.brandId)
    .eq('scope', 'brand')
    .maybeSingle()

  const { data: orgGuardrail } = await auth.ctx.admin
    .from('mbrain_spending_guardrails')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('scope', 'organization')
    .maybeSingle()

  const g = (guardrailRow ?? orgGuardrail) as Guardrails | null
  if (g) {
    const violations = evaluateBudgetAgainstGuardrails({
      guardrails: {
        monthly_spend_limit: g.monthly_spend_limit != null ? Number(g.monthly_spend_limit) : null,
        daily_spend_limit: g.daily_spend_limit != null ? Number(g.daily_spend_limit) : null,
        max_campaign_daily_budget:
          g.max_campaign_daily_budget != null ? Number(g.max_campaign_daily_budget) : null,
        max_budget_increase_percentage:
          g.max_budget_increase_percentage != null ? Number(g.max_budget_increase_percentage) : null,
        max_cpl: g.max_cpl != null ? Number(g.max_cpl) : null,
        auto_pause_enabled: Boolean(g.auto_pause_enabled),
        currency: g.currency ?? 'ILS',
      },
      proposedDailyBudget: parsed.data.dailyBudget,
      projectedMonthlySpend: parsed.data.totalBudget,
      proposedLifetimeBudget: parsed.data.totalBudget,
    })
    if (violations.length) {
      return NextResponse.json(
        { error: 'חריגה ממגבלות הוצאה', violations },
        { status: 422 }
      )
    }
  }

  const { data: objective, error } = await auth.ctx.admin
    .from('mbrain_marketing_objectives')
    .insert({
      organization_id: auth.ctx.organizationId,
      brand_id: parsed.data.brandId,
      title: parsed.data.title,
      goal_type: parsed.data.goalType,
      target_count: parsed.data.targetCount ?? null,
      max_cpl: parsed.data.maxCpl ?? null,
      total_budget: parsed.data.totalBudget ?? null,
      daily_budget: parsed.data.dailyBudget ?? null,
      market: parsed.data.market,
      audience: parsed.data.audience ?? null,
      product_name: parsed.data.productName ?? null,
      currency: parsed.data.currency,
      raw_brief: parsed.data.rawBrief ?? null,
      created_by: auth.ctx.userId,
      status: 'draft',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'objective.create',
    entityType: 'marketing_objective',
    entityId: objective.id,
    after: objective,
  })

  return NextResponse.json({ objective }, { status: 201 })
}
