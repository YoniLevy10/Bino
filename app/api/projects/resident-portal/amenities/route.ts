import { NextResponse } from 'next/server'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { sanitizeId } from '@/lib/api-validation'
import { logAudit } from '@/lib/audit'

export async function GET(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response
  const projectId = sanitizeId(new URL(req.url).searchParams.get('project_id'))
  if (!projectId) return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })

  const { data, error } = await auth.ctx.admin
    .from('project_amenities')
    .select(
      `id, name, description, guidelines, is_active, sort_order,
       project_amenity_hours(id, day_of_week, opens_at, closes_at, is_closed),
       project_amenity_exceptions(id, exception_date, opens_at, closes_at, is_closed, note)`
    )
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[portal/amenities GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ amenities: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const projectId = sanitizeId(body.project_id)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!projectId || !name) {
    return NextResponse.json({ error: 'חסרים שדות חובה' }, { status: 400 })
  }

  const { data: project } = await auth.ctx.admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })

  const { data: amenity, error } = await auth.ctx.admin
    .from('project_amenities')
    .insert({
      client_id: auth.ctx.clientId,
      project_id: projectId,
      name,
      description: typeof body.description === 'string' ? body.description : null,
      guidelines: typeof body.guidelines === 'string' ? body.guidelines : null,
      is_active: body.is_active !== false,
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
    })
    .select('id')
    .single()

  if (error || !amenity) {
    return NextResponse.json({ error: error?.message || 'שמירה נכשלה' }, { status: 500 })
  }

  const hours = Array.isArray(body.hours) ? body.hours : []
  if (hours.length) {
    const rows = hours
      .map((h: Record<string, unknown>) => ({
        amenity_id: amenity.id,
        day_of_week: Number(h.day_of_week),
        opens_at: h.is_closed ? null : (h.opens_at as string) || null,
        closes_at: h.is_closed ? null : (h.closes_at as string) || null,
        is_closed: Boolean(h.is_closed),
      }))
      .filter((h) => h.day_of_week >= 0 && h.day_of_week <= 6)
    if (rows.length) {
      const { error: hErr } = await auth.ctx.admin.from('project_amenity_hours').insert(rows)
      if (hErr) {
        console.error('[portal/amenities hours]', hErr.message)
        return NextResponse.json({ error: hErr.message }, { status: 500 })
      }
    }
  }

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: 'portal_amenity_created',
    entityType: 'project_amenity',
    entityId: amenity.id,
    newValues: { name, project_id: projectId },
  })

  return NextResponse.json({ ok: true, id: amenity.id })
}
