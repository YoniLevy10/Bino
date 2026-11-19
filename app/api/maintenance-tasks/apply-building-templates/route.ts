import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { applyBuildingTemplatesBodySchema } from '@/lib/api-body-schemas'
import { assertProjectOwnedByClient } from '@/lib/tenant/tenant-owned-refs'
import {
  BUILDING_MAINTENANCE_TEMPLATES,
  checklistFromTexts,
  firstDueIsoForCadence,
} from '@/lib/maintenance/maintenance-task-templates'
import { syncMaintenanceTaskToCalendar } from '@/lib/maintenance/maintenance-task-calendar-sync'

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'maintenance-apply-templates'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = applyBuildingTemplatesBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const projectIds = parsed.data.project_ids?.length
    ? parsed.data.project_ids.slice(0, 20)
    : parsed.data.project_id
      ? [parsed.data.project_id]
      : []
  if (projectIds.length === 0) {
    return NextResponse.json({ error: 'נא לבחור בניין' }, { status: 400 })
  }

  for (const pid of projectIds) {
    const ok = await assertProjectOwnedByClient(admin, auth.ctx.clientId, pid)
    if (!ok.ok) {
      return NextResponse.json({ error: ok.error }, { status: 400 })
    }
  }

  let templates = BUILDING_MAINTENANCE_TEMPLATES.map((t) => ({
    title: t.title,
    description: t.description,
    cadence: t.cadence,
    priority: t.priority,
    checklist: t.checklist,
    estimated_minutes: t.estimated_minutes,
  }))

  if (parsed.data.template_set_id) {
    const { data: setRow, error } = await admin
      .from('maintenance_task_template_sets')
      .select('id, items')
      .eq('id', parsed.data.template_set_id)
      .eq('client_id', auth.ctx.clientId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error || !setRow) {
      return NextResponse.json({ error: 'סט תבניות לא נמצא' }, { status: 404 })
    }
    const items = Array.isArray(setRow.items) ? setRow.items : []
    templates = items.map((it: Record<string, unknown>) => ({
      title: String(it.title || ''),
      description: typeof it.description === 'string' ? it.description : '',
      cadence: (it.cadence as typeof templates[0]['cadence']) || 'monthly',
      priority: (it.priority as typeof templates[0]['priority']) || 'MEDIUM',
      checklist: Array.isArray(it.checklist) ? (it.checklist as string[]) : [],
      estimated_minutes:
        typeof it.estimated_minutes === 'number' ? it.estimated_minutes : 30,
    })).filter((t) => t.title)
  }

  if (parsed.data.preview_only) {
    return NextResponse.json({
      preview: projectIds.flatMap((project_id) =>
        templates.map((t) => ({
          project_id,
          title: t.title,
          cadence: t.cadence,
          due_at: firstDueIsoForCadence(t.cadence),
        }))
      ),
      count: projectIds.length * templates.length,
    })
  }

  const createdIds: string[] = []
  for (const projectId of projectIds) {
    for (const t of templates) {
      const dueAt = firstDueIsoForCadence(t.cadence)
      const { data, error } = await admin
        .from('maintenance_tasks')
        .insert({
          client_id: auth.ctx.clientId,
          project_id: projectId,
          title: t.title,
          description: t.description || null,
          cadence: t.cadence,
          priority: t.priority,
          due_at: dueAt,
          checklist_items: checklistFromTexts(t.checklist || []),
          estimated_minutes: t.estimated_minutes ?? null,
          created_by: auth.ctx.userId,
          status: 'PENDING',
        })
        .select('id')
        .single()
      if (error || !data?.id) continue
      const seriesId = data.id as string
      await admin
        .from('maintenance_tasks')
        .update({ series_id: seriesId })
        .eq('id', seriesId)
      createdIds.push(seriesId)
      await syncMaintenanceTaskToCalendar(admin, {
        clientId: auth.ctx.clientId,
        userId: auth.ctx.userId,
        taskId: seriesId,
        title: t.title,
        dueAt,
        cadence: t.cadence,
        projectId,
        calendarEventId: null,
        status: 'PENDING',
      })
    }
  }

  return NextResponse.json({ created: createdIds.length, task_ids: createdIds })
}
