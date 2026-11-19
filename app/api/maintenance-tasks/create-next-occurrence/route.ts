import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { createNextOccurrenceBodySchema } from '@/lib/api-body-schemas'
import { createNextMaintenanceOccurrence } from '@/lib/maintenance-create-next-occurrence'

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'maintenance-next-occurrence'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = createNextOccurrenceBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { data: source, error } = await admin
    .from('maintenance_tasks')
    .select(
      'id, title, description, project_id, assigned_worker_id, priority, notes, cadence, due_at, series_id, checklist_items, asset_id, estimated_minutes'
    )
    .eq('id', parsed.data.task_id)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !source) {
    return NextResponse.json({ error: 'משימה לא נמצאה' }, { status: 404 })
  }

  const result = await createNextMaintenanceOccurrence(admin, {
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    source,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ task_id: result.taskId })
}
