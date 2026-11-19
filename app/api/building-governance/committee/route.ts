import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  requireSessionClientId,
  requireSessionWriteAccess,
} from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import {
  createCommitteeMemberBodySchema,
  updateCommitteeMemberBodySchema,
} from '@/lib/api-body-schemas'
import { assertProjectForClient } from '@/lib/building-governance/project-guard'
import { getLogger } from '@/lib/shared/logging'

export const dynamic = 'force-dynamic'

const SELECT =
  'id, project_id, resident_id, full_name, role, phone, email, term_start, term_end, is_active, notes, created_at, ended_at'

/** List committee members for a project (active first). */
export async function GET(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id נדרש' }, { status: 400 })
  }

  const includeEnded = url.searchParams.get('include_ended') === '1'
  const admin = getSupabaseAdmin()
  const gate = await assertProjectForClient(admin, projectId, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let query = admin
    .from('building_committee_members')
    .select(SELECT)
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (!includeEnded) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'committee list failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שגיאה בטעינת ועד' }, { status: 500 })
  }

  return NextResponse.json({ members: data ?? [] })
}

/** Create committee member. */
export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = createCommitteeMemberBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-governance-committee'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const gate = await assertProjectForClient(admin, body.project_id, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('building_committee_members')
    .insert({
      client_id: auth.ctx.clientId,
      project_id: body.project_id,
      full_name: body.full_name,
      role: body.role ?? 'member',
      phone: body.phone ?? null,
      email: body.email ?? null,
      term_start: body.term_start ?? null,
      term_end: body.term_end ?? null,
      resident_id: body.resident_id ?? null,
      notes: body.notes ?? null,
      created_by: auth.ctx.userId,
      created_at: now,
      updated_at: now,
      is_active: true,
    })
    .select(SELECT)
    .single()

  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'committee create failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שמירת חבר ועד נכשלה' }, { status: 500 })
  }

  let invite: { sent: boolean; sms: boolean; whatsapp: boolean } | null = null
  try {
    const { maybeInviteCommitteeMember } = await import(
      '@/lib/building-governance/committee-member-notify'
    )
    const { data: project } = await admin
      .from('projects')
      .select('name')
      .eq('id', body.project_id)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()

    invite = await maybeInviteCommitteeMember(admin, {
      clientId: auth.ctx.clientId,
      projectId: body.project_id,
      projectName: (project as { name?: string } | null)?.name,
      memberId: (data as { id: string }).id,
      fullName: body.full_name,
      phone: body.phone,
      role: body.role ?? 'member',
      sendInvite: body.send_invite,
      userId: auth.ctx.userId,
    })
  } catch (e) {
    getLogger().warn('BUILDING_GOVERNANCE', 'committee invite failed', {
      err: e instanceof Error ? e.message : String(e),
    })
  }

  return NextResponse.json({ member: data, invite }, { status: 201 })
}

/** Update / end committee member (history preserved). */
export async function PATCH(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = updateCommitteeMemberBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-governance-committee-patch'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const gate = await assertProjectForClient(admin, body.project_id, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.full_name !== undefined) patch.full_name = body.full_name
  if (body.role !== undefined) patch.role = body.role
  if (body.phone !== undefined) patch.phone = body.phone
  if (body.email !== undefined) patch.email = body.email
  if (body.term_start !== undefined) patch.term_start = body.term_start
  if (body.term_end !== undefined) patch.term_end = body.term_end
  if (body.notes !== undefined) patch.notes = body.notes
  if (body.is_active !== undefined) {
    patch.is_active = body.is_active
    if (body.is_active === false) patch.ended_at = new Date().toISOString()
    if (body.is_active === true) patch.ended_at = null
  }

  const { data, error } = await admin
    .from('building_committee_members')
    .update(patch)
    .eq('id', body.id)
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', body.project_id)
    .select(SELECT)
    .maybeSingle()

  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'committee update failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'עדכון חבר ועד נכשל' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'חבר ועד לא נמצא' }, { status: 404 })
  }

  return NextResponse.json({ member: data })
}
