import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { notifyBuildingDecisionResidentsBodySchema } from '@/lib/api-body-schemas'
import { assertProjectForClient } from '@/lib/building-governance/project-guard'
import { notifyDecisionToResidents } from '@/lib/building-governance/decision-resident-notify'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'
import { getLogger } from '@/lib/logging'

export const dynamic = 'force-dynamic'

/**
 * POST — after creating a decision: pick residents (or all) + SMS/email channels,
 * create signature stubs, send portal deep links (service messages only).
 */
export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = notifyBuildingDecisionResidentsBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-governance-decision-notify'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const gate = await assertProjectForClient(admin, body.project_id, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { data: decision, error: dErr } = await admin
    .from('building_decisions')
    .select('id, title, status, project_id')
    .eq('id', body.decision_id)
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', body.project_id)
    .maybeSingle()

  if (dErr) {
    return NextResponse.json({ error: 'שגיאה בטעינת החלטה' }, { status: 500 })
  }
  if (!decision) {
    return NextResponse.json({ error: 'החלטה לא נמצאה' }, { status: 404 })
  }
  if (decision.status !== 'open' && decision.status !== 'draft') {
    return NextResponse.json({ error: 'לא ניתן לשלוח החלטה סגורה' }, { status: 400 })
  }

  if (decision.status === 'draft') {
    await admin
      .from('building_decisions')
      .update({ status: 'open', updated_at: new Date().toISOString() })
      .eq('id', body.decision_id)
      .eq('client_id', auth.ctx.clientId)
  }

  const { data: project } = await admin
    .from('projects')
    .select('name')
    .eq('id', body.project_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  try {
    const result = await notifyDecisionToResidents(admin, {
      clientId: auth.ctx.clientId,
      projectId: body.project_id,
      projectName: (project as { name?: string } | null)?.name,
      decisionId: body.decision_id,
      decisionTitle: (decision as { title: string }).title,
      residentIds: body.resident_ids,
      allResidents: Boolean(body.all_residents),
      channels: body.channels ?? [],
      sendMessages: body.send_messages !== false,
      includePublicFallbackLink: Boolean(body.include_public_fallback),
      expiresInDays: body.expires_in_days,
      limit: body.limit,
      userId: auth.ctx.userId,
    })

    return NextResponse.json({
      ok: true,
      ...result,
      hint: !isBuildingGovernanceAutoNotifyEnabled()
        ? 'נוצרו בקשות חתימה; שליחת SMS/אימייל כבויה — הגדירו BUILDING_GOVERNANCE_AUTO_NOTIFY=true'
        : null,
    })
  } catch (e) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'decision resident notify failed',
      e instanceof Error ? e : new Error(String(e)),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שליחה לדיירים נכשלה' }, { status: 500 })
  }
}
