import { NextResponse } from 'next/server'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { createResidentPortalInvite, revokeResidentPortalMembership } from '@/lib/resident-portal/invites'
import { getResidentPortalAcceptInviteUrl } from '@/lib/public-origin'
import { sanitizeId } from '@/lib/api-validation'
import type { ResidentPortalRole } from '@/lib/resident-portal/types'

export async function GET(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const projectId = sanitizeId(url.searchParams.get('project_id'))
  if (!projectId) {
    return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })
  }

  const { data: project } = await auth.ctx.admin
    .from('projects')
    .select('id, resident_portal_enabled, city')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()
  if (!project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  const { data: invites, error } = await auth.ctx.admin
    .from('resident_portal_invites')
    .select(
      'id, email, role, expires_at, used_at, revoked_at, created_at, resident_id, unit_id, residents(full_name, apartment_number)'
    )
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[resident-portal/invites GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: memberships, error: mErr } = await auth.ctx.admin
    .from('resident_portal_memberships')
    .select(
      'id, role, status, resident_id, unit_id, user_id, created_at, revoked_at, residents(full_name, apartment_number, email)'
    )
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (mErr) {
    console.error('[resident-portal/memberships GET]', mErr.message)
    return NextResponse.json({ error: mErr.message }, { status: 500 })
  }

  return NextResponse.json({
    project: {
      id: project.id,
      resident_portal_enabled: project.resident_portal_enabled,
      city: project.city,
    },
    invites: invites ?? [],
    memberships: memberships ?? [],
  })
}

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let body: {
    project_id?: unknown
    resident_id?: unknown
    unit_id?: unknown
    email?: unknown
    role?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const projectId = sanitizeId(body.project_id)
  const residentId = sanitizeId(body.resident_id)
  const unitId = sanitizeId(body.unit_id)
  const email = typeof body.email === 'string' ? body.email : ''
  const role = (typeof body.role === 'string' ? body.role : 'owner') as ResidentPortalRole

  if (!projectId || !residentId || !email) {
    return NextResponse.json({ error: 'חסרים שדות חובה' }, { status: 400 })
  }

  try {
    const created = await createResidentPortalInvite(auth.ctx.admin, {
      clientId: auth.ctx.clientId,
      projectId,
      residentId,
      unitId,
      email,
      role: ['owner', 'renter', 'other'].includes(role) ? role : 'owner',
      createdBy: auth.ctx.userId,
    })

    const acceptUrl = getResidentPortalAcceptInviteUrl(created.token)

    return NextResponse.json({
      ok: true,
      inviteId: created.inviteId,
      expiresAt: created.expiresAt,
      email: created.email,
      // Token returned once to manager for copy/share — not stored in plaintext.
      acceptUrl,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'יצירת הזמנה נכשלה'
    console.error('[resident-portal/invites POST]', msg)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const membershipId = sanitizeId(url.searchParams.get('membership_id'))
  if (!membershipId) {
    return NextResponse.json({ error: 'חסר membership_id' }, { status: 400 })
  }

  try {
    await revokeResidentPortalMembership(auth.ctx.admin, {
      clientId: auth.ctx.clientId,
      membershipId,
      revokedBy: auth.ctx.userId,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'ביטול גישה נכשל'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
