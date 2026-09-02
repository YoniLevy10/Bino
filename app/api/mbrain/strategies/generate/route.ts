import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { generateCampaignPlan, loadBrandContext } from '@/lib/mbrain/agents/marketing-director'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import type { Guardrails } from '@/lib/mbrain/guardrails'
import { z } from 'zod'

const bodySchema = z.object({
  objectiveId: z.string().uuid(),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'mbrain-strategy-generate'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
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

  const { data: objective, error: objErr } = await auth.ctx.admin
    .from('mbrain_marketing_objectives')
    .select('*')
    .eq('id', parsed.data.objectiveId)
    .eq('organization_id', auth.ctx.organizationId)
    .maybeSingle()

  if (objErr || !objective) {
    return NextResponse.json({ error: 'יעד לא נמצא' }, { status: 404 })
  }

  const ctx = await loadBrandContext(auth.ctx.admin, auth.ctx.organizationId, objective.brand_id)
  if (!ctx) return NextResponse.json({ error: 'מותג לא נמצא' }, { status: 404 })

  const { data: brandGuard } = await auth.ctx.admin
    .from('mbrain_spending_guardrails')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('brand_id', objective.brand_id)
    .eq('scope', 'brand')
    .maybeSingle()

  const { data: orgGuard } = await auth.ctx.admin
    .from('mbrain_spending_guardrails')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('scope', 'organization')
    .maybeSingle()

  const raw = brandGuard ?? orgGuard
  const guardrails: Guardrails = {
    monthly_spend_limit: raw?.monthly_spend_limit != null ? Number(raw.monthly_spend_limit) : null,
    daily_spend_limit: raw?.daily_spend_limit != null ? Number(raw.daily_spend_limit) : null,
    max_campaign_daily_budget:
      raw?.max_campaign_daily_budget != null ? Number(raw.max_campaign_daily_budget) : null,
    max_budget_increase_percentage:
      raw?.max_budget_increase_percentage != null ? Number(raw.max_budget_increase_percentage) : 20,
    max_cpl: raw?.max_cpl != null ? Number(raw.max_cpl) : null,
    auto_pause_enabled: Boolean(raw?.auto_pause_enabled),
    currency: (raw?.currency as string) ?? 'ILS',
  }

  const { data: run } = await auth.ctx.admin
    .from('mbrain_agent_runs')
    .insert({
      organization_id: auth.ctx.organizationId,
      brand_id: objective.brand_id,
      agent: 'marketing_director',
      input: { objectiveId: objective.id },
      status: 'running',
    })
    .select('id')
    .single()

  try {
    const generated = await generateCampaignPlan({
      objective,
      ctx,
      guardrails,
    })

    const { data: existing } = await auth.ctx.admin
      .from('mbrain_strategies')
      .select('version')
      .eq('objective_id', objective.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const version = (existing?.version ?? 0) + 1

    const { data: strategy, error: stratErr } = await auth.ctx.admin
      .from('mbrain_strategies')
      .insert({
        organization_id: auth.ctx.organizationId,
        brand_id: objective.brand_id,
        objective_id: objective.id,
        version,
        status: 'pending_review',
        plan: generated.plan,
        model_provider: generated.provider,
        model_name: generated.model,
        generation_cost_usd: generated.costUsd,
      })
      .select('*')
      .single()

    if (stratErr) throw new Error(stratErr.message)

    await auth.ctx.admin
      .from('mbrain_marketing_objectives')
      .update({ status: 'strategy_ready', updated_at: new Date().toISOString() })
      .eq('id', objective.id)

    if (run?.id) {
      await auth.ctx.admin
        .from('mbrain_agent_runs')
        .update({
          status: 'completed',
          result: { strategyId: strategy.id, source: generated.source },
          model_provider: generated.provider,
          model_name: generated.model,
          cost_usd: generated.costUsd,
          tools_used: ['generateCampaignPlan', 'loadBrandContext', 'guardrails'],
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id)

      await auth.ctx.admin.from('mbrain_agent_actions').insert({
        organization_id: auth.ctx.organizationId,
        agent_run_id: run.id,
        action_type: 'strategy.generate',
        target_type: 'strategy',
        target_id: strategy.id,
        after_state: { version, source: generated.source },
        status: 'executed',
      })
    }

    if (generated.costUsd > 0) {
      await auth.ctx.admin.from('mbrain_cost_events').insert({
        organization_id: auth.ctx.organizationId,
        brand_id: objective.brand_id,
        category: 'ai_llm',
        provider: generated.provider,
        model: generated.model,
        estimated_cost: generated.costUsd,
        currency: 'USD',
        metadata: { strategyId: strategy.id },
      })
    }

    await writeMbrainAudit(auth.ctx.admin, {
      organizationId: auth.ctx.organizationId,
      actorUserId: auth.ctx.userId,
      action: 'strategy.generate',
      entityType: 'strategy',
      entityId: strategy.id,
      after: { version, source: generated.source },
    })

    return NextResponse.json({
      strategy,
      source: generated.source,
      costUsd: generated.costUsd,
    })
  } catch (e) {
    if (run?.id) {
      await auth.ctx.admin
        .from('mbrain_agent_runs')
        .update({
          status: 'failed',
          error_message: e instanceof Error ? e.message : String(e),
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id)
    }
    const code = e instanceof Error && 'code' in e ? String((e as { code?: string }).code) : null
    if (code === 'GUARDRAIL_VIOLATION') {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'חריגת מגבלות' },
        { status: 422 }
      )
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'יצירת אסטרטגיה נכשלה' },
      { status: 500 }
    )
  }
}
