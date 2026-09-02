import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { decideApproval } from '@/lib/mbrain/approval-engine'
import { executeApprovedLaunch } from '@/lib/mbrain/launch'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import type { Guardrails } from '@/lib/mbrain/guardrails'
import { z } from 'zod'

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.ctx.admin
    .from('mbrain_approvals')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ approvals: data ?? [] })
}

const bodySchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  executeLaunch: z.boolean().default(true),
  note: z.string().optional(),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'mbrain-approvals')
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

  try {
    const approval = await decideApproval(auth.ctx.admin, {
      organizationId: auth.ctx.organizationId,
      approvalId: parsed.data.approvalId,
      decision: parsed.data.decision,
      decidedBy: auth.ctx.userId,
      note: parsed.data.note,
    })

    await writeMbrainAudit(auth.ctx.admin, {
      organizationId: auth.ctx.organizationId,
      actorUserId: auth.ctx.userId,
      action: `approval.${parsed.data.decision}`,
      entityType: 'approval',
      entityId: parsed.data.approvalId,
      after: approval,
    })

    let launch = null
    if (
      parsed.data.decision === 'approved' &&
      parsed.data.executeLaunch &&
      approval.action_type === 'launch_campaign'
    ) {
      const brandId = approval.brand_id as string | null
      const { data: brandGuard } = brandId
        ? await auth.ctx.admin
            .from('mbrain_spending_guardrails')
            .select('*')
            .eq('organization_id', auth.ctx.organizationId)
            .eq('brand_id', brandId)
            .eq('scope', 'brand')
            .maybeSingle()
        : { data: null }
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

      launch = await executeApprovedLaunch(auth.ctx.admin, {
        organizationId: auth.ctx.organizationId,
        campaignId: approval.target_id as string,
        approvalId: parsed.data.approvalId,
        guardrails,
      })
    }

    return NextResponse.json({ approval, launch })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה' },
      { status: 400 }
    )
  }
}
