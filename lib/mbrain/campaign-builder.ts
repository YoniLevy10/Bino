/**
 * Build local campaign draft from approved strategy + approved creatives.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { CampaignPlan } from '@/lib/mbrain/strategy-schema'
import { assertGuardrailsAllow, type Guardrails } from '@/lib/mbrain/guardrails'

export function buildLaunchIdempotencyKey(parts: {
  organizationId: string
  strategyId: string
  dailyBudget: number
  creativeIds: string[]
}): string {
  const raw = [
    parts.organizationId,
    parts.strategyId,
    String(parts.dailyBudget),
    ...[...parts.creativeIds].sort(),
  ].join('|')
  return createHash('sha256').update(raw).digest('hex').slice(0, 48)
}

export async function createCampaignDraftFromStrategy(
  admin: SupabaseClient,
  opts: {
    organizationId: string
    brandId: string
    strategyId: string
    landingPageUrl?: string | null
    guardrails: Guardrails
  }
): Promise<{
  campaign: Record<string, unknown>
  adSets: Record<string, unknown>[]
  ads: Record<string, unknown>[]
  preview: Record<string, unknown>
  idempotencyKey: string
}> {
  const { data: strategy } = await admin
    .from('mbrain_strategies')
    .select('*')
    .eq('id', opts.strategyId)
    .eq('organization_id', opts.organizationId)
    .maybeSingle()

  if (!strategy) throw new Error('Strategy not found')
  if (strategy.status !== 'approved') throw new Error('Strategy must be approved before draft')

  const plan = strategy.plan as CampaignPlan
  const dailyBudget = plan.budget.daily ?? 0

  assertGuardrailsAllow({
    guardrails: opts.guardrails,
    proposedDailyBudget: dailyBudget,
    projectedMonthlySpend: plan.budget.monthly ?? dailyBudget * 30,
  })

  const { data: creatives } = await admin
    .from('mbrain_creatives')
    .select('*')
    .eq('brand_id', opts.brandId)
    .eq('organization_id', opts.organizationId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(6)

  if (!creatives?.length) throw new Error('No approved creatives — approve creatives first')

  const creativeIds = creatives.map((c) => c.id as string)
  const idempotencyKey = buildLaunchIdempotencyKey({
    organizationId: opts.organizationId,
    strategyId: opts.strategyId,
    dailyBudget,
    creativeIds,
  })

  const { data: existing } = await admin
    .from('mbrain_campaigns')
    .select('*')
    .eq('organization_id', opts.organizationId)
    .eq('launch_idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existing) {
    const [{ data: adSets }, { data: ads }] = await Promise.all([
      admin.from('mbrain_ad_sets').select('*').eq('campaign_id', existing.id),
      admin.from('mbrain_ads').select('*').eq('campaign_id', existing.id),
    ])
    return {
      campaign: existing,
      adSets: adSets ?? [],
      ads: ads ?? [],
      preview: buildPreview(existing, adSets ?? [], ads ?? [], creatives, plan),
      idempotencyKey,
    }
  }

  const { data: planRow } = await admin
    .from('mbrain_campaign_plans')
    .insert({
      organization_id: opts.organizationId,
      brand_id: opts.brandId,
      strategy_id: opts.strategyId,
      objective_id: strategy.objective_id,
      name: `Plan · ${plan.objective.slice(0, 60)}`,
      status: 'preview',
      structure: plan,
      estimated_max_spend: plan.budget.monthly ?? dailyBudget * 30,
      landing_page_url: opts.landingPageUrl ?? null,
      idempotency_key: `plan_${idempotencyKey}`,
    })
    .select('*')
    .single()

  const { data: campaign, error } = await admin
    .from('mbrain_campaigns')
    .insert({
      organization_id: opts.organizationId,
      brand_id: opts.brandId,
      campaign_plan_id: planRow?.id ?? null,
      strategy_id: opts.strategyId,
      name: `Bamakor Leads · ${new Date().toISOString().slice(0, 10)}`,
      status: 'preview',
      objective: plan.campaignObjective,
      daily_budget: dailyBudget,
      currency: plan.budget.currency,
      landing_page_url: opts.landingPageUrl ?? 'https://bamakor.vercel.app',
      launch_idempotency_key: idempotencyKey,
      structure: {
        audienceHypotheses: plan.audienceHypotheses,
        placements: ['facebook', 'instagram'],
        locations: ['IL'],
      },
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  const { data: adSet, error: adSetErr } = await admin
    .from('mbrain_ad_sets')
    .insert({
      organization_id: opts.organizationId,
      campaign_id: campaign.id,
      name: 'IL · PMC decision makers',
      status: 'draft',
      daily_budget: dailyBudget,
      targeting: {
        geo: ['IL'],
        audienceHypothesis: plan.audienceHypotheses[0] ?? null,
      },
    })
    .select('*')
    .single()

  if (adSetErr) throw new Error(adSetErr.message)

  const adsPayload = creatives.map((c, i) => ({
    organization_id: opts.organizationId,
    campaign_id: campaign.id,
    ad_set_id: adSet.id,
    creative_id: c.id,
    hypothesis_id: c.hypothesis_id,
    name: `Ad · ${String(c.headline).slice(0, 40)} · ${i + 1}`,
    status: 'draft',
  }))

  const { data: ads, error: adsErr } = await admin.from('mbrain_ads').insert(adsPayload).select('*')
  if (adsErr) throw new Error(adsErr.message)

  return {
    campaign,
    adSets: [adSet],
    ads: ads ?? [],
    preview: buildPreview(campaign, [adSet], ads ?? [], creatives, plan),
    idempotencyKey,
  }
}

function buildPreview(
  campaign: Record<string, unknown>,
  adSets: Record<string, unknown>[],
  ads: Record<string, unknown>[],
  creatives: Record<string, unknown>[],
  plan: CampaignPlan
) {
  const daily = Number(campaign.daily_budget ?? 0)
  return {
    campaignObjective: campaign.objective,
    audience: plan.audienceHypotheses,
    locations: ['IL'],
    budget: { daily, currency: campaign.currency, estimatedMaxMonthly: daily * 30 },
    schedule: 'continuous',
    placements: ['facebook', 'instagram'],
    ads: ads.map((a) => ({
      id: a.id,
      name: a.name,
      creativeId: a.creative_id,
    })),
    creatives: creatives.map((c) => ({
      id: c.id,
      headline: c.headline,
      hook: c.hook,
      format: c.format,
    })),
    estimatedMaximumSpend: daily * 30,
    landingPage: campaign.landing_page_url,
    tracking: { pixel: 'configure_in_integrations', note: 'Phase D pixel selection' },
    adSetCount: adSets.length,
  }
}
