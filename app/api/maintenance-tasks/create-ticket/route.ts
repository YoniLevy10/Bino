import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { createTicketFromTaskBodySchema } from '@/lib/api-body-schemas'
import { createTicketShared } from '@/lib/tickets/create-ticket-service'

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'maintenance-create-ticket'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = createTicketFromTaskBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { data: task, error } = await admin
    .from('maintenance_tasks')
    .select('id, title, description, project_id, notes')
    .eq('id', parsed.data.task_id)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !task) {
    return NextResponse.json({ error: 'משימה לא נמצאה' }, { status: 404 })
  }
  if (!task.project_id) {
    return NextResponse.json({ error: 'יש לשייך בניין למשימה לפני פתיחת תקלה' }, { status: 400 })
  }

  const description =
    parsed.data.description?.trim() ||
    `נפתח ממשימת אחזקה: ${task.title}\n${task.description || ''}\n${task.notes || ''}`.trim()

  try {
    const created = await createTicketShared(admin, {
      clientId: auth.ctx.clientId,
      projectId: task.project_id as string,
      description,
      source: 'maintenance_task',
      reporterName: 'משימת אחזקה',
      skipPendingResident: true,
    })

    await admin
      .from('tickets')
      .update({ source_maintenance_task_id: task.id })
      .eq('id', created.ticketId)
      .eq('client_id', auth.ctx.clientId)

    return NextResponse.json({
      ticket_id: created.ticketId,
      ticket_number: created.ticketNumber,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'יצירת תקלה נכשלה' },
      { status: 500 }
    )
  }
}
