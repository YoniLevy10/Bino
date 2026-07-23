import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assignTicketToWorker } from '@/lib/assign-ticket-worker'
import { requireSessionMinRole } from '@/lib/api-auth'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { assignWorkerBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `assign-ticket-${Date.now()}`
  
  logger.info('TICKET_API', 'Assign ticket request received', { requestId })
  
  try {
    let supabaseAdmin
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (envError) {
      const error = envError instanceof Error ? envError : new Error(String(envError))
      logger.error('TICKET_API', 'Failed to initialize Supabase admin', error, { requestId })
      return NextResponse.json(
        {
          error: 'Server configuration error. Required environment variables are not set.',
          details: process.env.NODE_ENV === 'development' ? String(envError) : undefined,
        },
        { status: 500 }
      )
    }

    const auth = await requireSessionMinRole('manager')
    if (!auth.ok) return auth.response
    const bamakorClientId = auth.ctx.clientId

    const rawBody = await req.json()
    const validated = assignWorkerBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }
    const { ticket_id, worker_id } = validated.data

    const rl = await checkAuthenticatedPostRouteLimit(supabaseAdmin, auth.ctx.userId, 'assign-ticket')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    if (!ticket_id || !worker_id) {
      logger.error('TICKET_API', 'Missing required parameters', undefined, { requestId, ticket_id, worker_id })
      return NextResponse.json(
        { error: 'ticket_id and worker_id are required', requestId },
        { status: 400 }
      )
    }

    const ticketQuery = supabaseAdmin
      .from('tickets')
      .select(`
        id,
        ticket_number,
        description,
        project_id,
        client_id,
        status,
        assigned_worker_id,
        projects (
          name,
          project_code
        )
      `)
      .eq('id', ticket_id)
      .eq('client_id', bamakorClientId)
      .is('deleted_at', null)

    const { data: ticket, error: ticketError } = await ticketQuery.single()

    if (ticketError || !ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      )
    }

    const clientId = bamakorClientId

    const { data: clientRow } = await supabaseAdmin
      .from('clients')
      .select('name, sms_sender_name')
      .eq('id', clientId)
      .maybeSingle()

    const clientName = (clientRow as { name?: string | null } | null)?.name || 'המערכת'
    const smsSenderName =
      (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null

    const { data: worker, error: workerError } = await supabaseAdmin
      .from('workers')
      .select('id, full_name, phone, extra_phones, role, is_active, access_token')
      .eq('id', worker_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .single()

    if (workerError || !worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      )
    }

    const project = Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects
    const buildingName = project?.name || 'ללא שם בניין'

    const assignResult = await assignTicketToWorker(supabaseAdmin, {
      ticketId: ticket_id,
      workerId: worker_id,
      clientId,
      ticketNumber: ticket.ticket_number as number,
      description: (ticket.description as string | null) ?? null,
      buildingName,
      smsSenderName,
      logNotes: `Ticket assigned to worker ${worker.full_name}`,
    })

    if (!assignResult.ok) {
      logger.error('TICKET_API', 'Failed to assign ticket', new Error(assignResult.error || 'assign failed'), {
        requestId,
        ticket_id,
        worker_id,
      })
      audit.logFailedOperation('UPDATE', 'TICKET', ticket_id, clientId, assignResult.error || 'assign failed')
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    audit.logTicketAssigned(clientId, ticket_id, worker_id)
    logger.info('TICKET_API', 'Ticket assigned successfully', { requestId, ticket_id, worker_id })

    await logAudit({
      clientId,
      userId: auth.ctx.userId,
      action: 'ASSIGN_TICKET',
      entityType: 'ticket',
      entityId: ticket_id,
      oldValues: {
        assigned_worker_id: (ticket as { assigned_worker_id?: string | null }).assigned_worker_id ?? null,
        status: (ticket as { status?: string }).status,
      },
      newValues: { assigned_worker_id: worker_id, status: 'ASSIGNED' },
    })

    const batch = assignResult.workerSms
    let workerSmsSent: boolean | null = null
    let workerSmsNote = assignResult.workerSmsNote

    if (batch) {
      workerSmsSent = batch.ok
      if (batch.ok) {
        logger.info('TICKET_API', 'Worker SMS sent', {
          requestId,
          ticket_id,
          worker_id,
          phone_count: batch.total,
        })
      } else if (batch.sent > 0) {
        workerSmsNote =
          workerSmsNote ||
          `SMS נשלח ל-${batch.sent} מתוך ${batch.total} מספרים. בדקו מספרים נוספים והגדרות 019SMS.`
      } else if (!workerSmsNote) {
        workerSmsNote =
          'שליחת SMS לעובד נכשלה (019SMS / פורמט מספר / הרשאות). בדקו לוגים ב-Vercel והגדרות SMS_019_*.'
      }
    } else if (!workerSmsNote) {
      workerSmsSent = null
      workerSmsNote = 'לעובד אין מספר טלפון במערכת — לא נשלח SMS.'
    }

    return NextResponse.json({
      success: true,
      ticket: assignResult.updatedTicket,
      worker_sms_sent: workerSmsSent,
      worker_sms_note: workerSmsNote,
      requestId,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('TICKET_API', 'Assign ticket route error', err, { requestId })
    return NextResponse.json(
      { error: 'internal', requestId },
      { status: 500 }
    )
  }
}

