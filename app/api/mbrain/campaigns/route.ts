import { NextResponse } from 'next/server'
import { assertBrandInOrg, requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { createCampaignDraftFromStrategy } from '@/lib/mbrain/campaign-builder'
import { requestApproval } from '@/lib/mbrain/approval-engine'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import type { Guardrails } from '@/lib/mbrain/guardrails'
import { z } from 'zod'
import { getMetaDataLabel, getMetaMode } from '@/lib/mbrain/meta/client'

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.ctx.admin
    .from('mbrain_campaigns')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    campaigns: data ?? [],
    meta: { mode: getMetaMode(), label: getMetaDataLabel() },
  })
}

const draftSchema = z.object({
  brandId: z.string().uuid(),
  strategyId: z.string().uuid(),
  landingPageUrl: z.string().url().optional(),
  requestLaunchApproval: z.boolean().default(true),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'mbrain-campaign-draft')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = draftSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין', details: parsed.error.flatten() }, { status: 400 })
  }

  const ok = await assertBrandInOrg(auth.ctx.admin, auth.ctx.organizationId, parsed.data.brandId)
  if (!ok) return NextResponse.json({ error: 'מותג לא נמצא' }, { status: 404 })

  const { data: brandGuard } = await auth.ctx.admin
    .from('mbrain_spending_guardrails')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('brand_id', parsed.data.brandId)
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

  try {
    const draft = await createCampaignDraftFromStrategy(auth.ctx.admin, {
      organizationId: auth.ctx.organizationId,
      brandId: parsed.data.brandId,
      strategyId: parsed.data.strategyId,
      landingPageUrl: parsed.data.landingPageUrl,
      guardrails,
    })

    let approval = null
    if (parsed.data.requestLaunchApproval) {
      await auth.ctx.admin
        .from('mbrain_campaigns')
        .update({ status: 'pending_approval' })
        .eq('id', draft.campaign.id)

      approval = await requestApproval(auth.ctx.admin, {
        organizationId: auth.ctx.organizationId,
        brandId: parsed.data.brandId,
        actionType: 'launch_campaign',
        targetType: 'campaign',
        targetId: draft.campaign.id as string,
        requestedBy: auth.ctx.userId,
        budgetApproved: Number(draft.campaign.daily_budget ?? 0),
        payload: {
          dailyBudget: Number(draft.campaign.daily_budget ?? 0),
          projectedMonthlySpend: Number(draft.campaign.daily_budget ?? 0) * 30,
          preview: draft.preview,
          idempotencyKey: draft.idempotencyKey,
        },
        guardrails,
      })
    }

    await writeMbrainAudit(auth.ctx.admin, {
      organizationId: auth.ctx.organizationId,
      actorUserId: auth.ctx.userId,
      action: 'campaign.draft',
      entityType: 'campaign',
      entityId: draft.campaign.id as string,
      after: { idempotencyKey: draft.idempotencyKey, approvalId: approval?.id },
    })

    return NextResponse.json({
      ...draft,
      approval,
      meta: { mode: getMetaMode(), label: getMetaDataLabel() },
    }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes('GUARDRAIL') || msg.includes('exceed') ? 422 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
