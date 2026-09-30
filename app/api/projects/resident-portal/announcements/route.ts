import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { sanitizeId } from '@/lib/api-validation'
import { logAudit } from '@/lib/audit'

export async function GET(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response
  const projectId = sanitizeId(new URL(req.url).searchParams.get('project_id'))
  if (!projectId) return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })

  const { data, error } = await auth.ctx.admin
    .from('project_announcements')
    .select(
      'id, title, body, status, is_pinned, publish_at, published_at, expires_at, created_at, project_announcement_audience(id, audience_type, building_id, unit_id)'
    )
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[portal/announcements GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ announcements: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const projectId = sanitizeId(body.project_id)
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const text = typeof body.body === 'string' ? body.body : ''
  const status = typeof body.status === 'string' ? body.status : 'draft'
  if (!projectId || !title) {
    return NextResponse.json({ error: 'חסרים שדות חובה' }, { status: 400 })
  }
  if (!['draft', 'published', 'archived'].includes(status)) {
    return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 })
  }

  const { data: project } = await auth.ctx.admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })

  const publishAt =
    typeof body.publish_at === 'string' && body.publish_at ? body.publish_at : null
  const expiresAt =
    typeof body.expires_at === 'string' && body.expires_at ? body.expires_at : null
  const isPinned = Boolean(body.is_pinned)

  const insert = {
    client_id: auth.ctx.clientId,
    project_id: projectId,
    title,
    body: text,
    status,
    is_pinned: isPinned,
    publish_at: publishAt,
    expires_at: expiresAt,
    published_at: status === 'published' ? new Date().toISOString() : null,
    created_by: auth.ctx.userId,
  }

  const { data, error } = await auth.ctx.admin
    .from('project_announcements')
    .insert(insert)
    .select('id')
    .single()

  if (error || !data) {
    console.error('[portal/announcements POST]', error?.message)
    return NextResponse.json({ error: error?.message || 'שמירה נכשלה' }, { status: 500 })
  }

  // Default audience = whole project
  await auth.ctx.admin.from('project_announcement_audience').insert({
    announcement_id: data.id,
    audience_type: 'project',
  })

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: status === 'published' ? 'portal_announcement_published' : 'portal_announcement_draft',
    entityType: 'project_announcement',
    entityId: data.id,
    newValues: { title, status, project_id: projectId },
  })

  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const id = sanitizeId(body.id)
  if (!id) return NextResponse.json({ error: 'חסר id' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string') patch.title = body.title.trim()
  if (typeof body.body === 'string') patch.body = body.body
  if (typeof body.is_pinned === 'boolean') patch.is_pinned = body.is_pinned
  if (typeof body.publish_at === 'string') patch.publish_at = body.publish_at || null
  if (typeof body.expires_at === 'string') patch.expires_at = body.expires_at || null
  if (typeof body.status === 'string') {
    if (!['draft', 'published', 'archived'].includes(body.status)) {
      return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 })
    }
    patch.status = body.status
    if (body.status === 'published') {
      patch.published_at = new Date().toISOString()
    }
  }

  const { data, error } = await auth.ctx.admin
    .from('project_announcements')
    .update(patch)
    .eq('id', id)
    .eq('client_id', auth.ctx.clientId)
    .select('id, status')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: 'portal_announcement_updated',
    entityType: 'project_announcement',
    entityId: id,
    newValues: patch,
  })

  return NextResponse.json({ ok: true, announcement: data })
}
