import { NextResponse } from 'next/server'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { sanitizeId } from '@/lib/api-validation'
import { logAudit } from '@/lib/audit'

export async function GET(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const projectId = sanitizeId(new URL(req.url).searchParams.get('project_id'))
  if (!projectId) {
    return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })
  }

  const { data, error } = await auth.ctx.admin
    .from('projects')
    .select(
      'id, name, city, address, resident_portal_enabled, resident_portal_private_ticket_policy, resident_portal_contact_phone, resident_portal_contact_email'
    )
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (error) {
    console.error('[resident-portal/settings GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })

  const { data: residents } = await auth.ctx.admin
    .from('residents')
    .select('id, full_name, apartment_number, email, phone')
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('apartment_number', { ascending: true })
    .limit(500)

  return NextResponse.json({ project: data, residents: residents ?? [] })
}

export async function PATCH(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const projectId = sanitizeId(body.project_id)
  if (!projectId) {
    return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.resident_portal_enabled === 'boolean') {
    patch.resident_portal_enabled = body.resident_portal_enabled
  }
  if (typeof body.city === 'string') {
    patch.city = body.city.trim() || null
  }
  if (typeof body.resident_portal_private_ticket_policy === 'string') {
    const p = body.resident_portal_private_ticket_policy
    if (!['midrag_search', 'contact_only', 'disabled'].includes(p)) {
      return NextResponse.json({ error: 'מדיניות תקלה פרטית לא תקינה' }, { status: 400 })
    }
    patch.resident_portal_private_ticket_policy = p
  }
  if (typeof body.resident_portal_contact_phone === 'string') {
    patch.resident_portal_contact_phone = body.resident_portal_contact_phone.trim() || null
  }
  if (typeof body.resident_portal_contact_email === 'string') {
    patch.resident_portal_contact_email = body.resident_portal_contact_email.trim() || null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 })
  }

  const { data, error } = await auth.ctx.admin
    .from('projects')
    .update(patch)
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .select(
      'id, name, city, resident_portal_enabled, resident_portal_private_ticket_policy, resident_portal_contact_phone, resident_portal_contact_email'
    )
    .maybeSingle()

  if (error) {
    console.error('[resident-portal/settings PATCH]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: 'portal_settings_updated',
    entityType: 'project',
    entityId: projectId,
    newValues: patch,
  })

  return NextResponse.json({ project: data })
}
