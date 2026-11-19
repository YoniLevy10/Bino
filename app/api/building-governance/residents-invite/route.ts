import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { residentJoinInviteBatchBodySchema } from '@/lib/api-body-schemas'
import { assertProjectForClient } from '@/lib/building-governance/project-guard'
import { sendResidentJoinInvitesBatch } from '@/lib/building-governance/resident-join-invite'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'
import { getLogger } from '@/lib/shared/logging'

export const dynamic = 'force-dynamic'

/** Batch-send resident portal join invites (SMS / in-session WA). */
export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  if (!isBuildingGovernanceAutoNotifyEnabled()) {
    return NextResponse.json(
      {
        error: 'שליחה אוטומטית כבויה. הגדירו BUILDING_GOVERNANCE_AUTO_NOTIFY=true',
        code: 'AUTO_NOTIFY_DISABLED',
      },
      { status: 403 }
    )
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = residentJoinInviteBatchBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-governance-residents-invite'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const gate = await assertProjectForClient(admin, body.project_id, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { data: project } = await admin
    .from('projects')
    .select('name')
    .eq('id', body.project_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  try {
    const result = await sendResidentJoinInvitesBatch(admin, {
      clientId: auth.ctx.clientId,
      projectId: body.project_id,
      projectName: (project as { name?: string } | null)?.name,
      userId: auth.ctx.userId,
      limit: body.limit,
      residentIds: body.resident_ids,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'residents invite batch failed',
      e instanceof Error ? e : new Error(String(e)),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שליחת הזמנות נכשלה' }, { status: 500 })
  }
}
