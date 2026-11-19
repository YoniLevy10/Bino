import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { remindBuildingDecisionBodySchema } from '@/lib/api-body-schemas'
import { assertProjectForClient } from '@/lib/building-governance/project-guard'
import { remindPendingDecisionSigners } from '@/lib/building-governance/decision-remind'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'
import { GOVERNANCE_WA_HSM_NOTE_HE } from '@/lib/building-governance/decision-summary'
import { getLogger } from '@/lib/shared/logging'

export const dynamic = 'force-dynamic'

/**
 * POST — remind pending signers via SMS/email.
 * WhatsApp only when Meta 24h session is open; otherwise SMS/email + HSM note.
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

  const parsed = remindBuildingDecisionBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-governance-decision-remind'
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
    return NextResponse.json({ error: 'לא ניתן לשלוח תזכורת להחלטה סגורה' }, { status: 400 })
  }

  const { data: project } = await admin
    .from('projects')
    .select('name')
    .eq('id', body.project_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  try {
    const result = await remindPendingDecisionSigners(admin, {
      clientId: auth.ctx.clientId,
      projectId: body.project_id,
      projectName: (project as { name?: string } | null)?.name,
      decisionId: body.decision_id,
      decisionTitle: (decision as { title: string }).title,
      channels: body.channels ?? ['sms', 'email'],
      sendMessages: body.send_messages !== false,
      limit: body.limit,
      userId: auth.ctx.userId,
    })

    return NextResponse.json({
      ok: true,
      ...result,
      hint: !isBuildingGovernanceAutoNotifyEnabled()
        ? 'שליחת SMS/אימייל כבויה — הגדירו BUILDING_GOVERNANCE_AUTO_NOTIFY=true'
        : result.wa_skipped_outside_session > 0
          ? GOVERNANCE_WA_HSM_NOTE_HE
          : null,
    })
  } catch (e) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'decision remind failed',
      e instanceof Error ? e : new Error(String(e)),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שליחת תזכורות נכשלה' }, { status: 500 })
  }
}
