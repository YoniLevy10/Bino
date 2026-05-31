import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendWorkerSMSAll } from '@/lib/sms-send'
import { collectWorkerPhones } from '@/lib/worker-phones'
import { requireSessionClientId } from '@/lib/api-auth'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { getWorkerPortalUrl } from '@/lib/public-app-url'
import { assignWorkerBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { notifyWorkerAssignedPush } from '@/lib/push-notifications'

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

    const auth = await requireSessionClientId()
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

    let workerSmsSent: boolean | null = null
    let workerSmsNote: string | undefined

    const { data: updatedTicket, error: updateError } = await supabaseAdmin
      .from('tickets')
      .update({
        assigned_worker_id: worker_id,
        status: 'ASSIGNED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .select()
      .single()

    if (updateError) {
      logger.error('TICKET_API', 'Failed to assign ticket', updateError, { requestId, ticket_id, worker_id })
      audit.logFailedOperation('UPDATE', 'TICKET', ticket_id, clientId, `Assignment failed: ${updateError.message}`)
      return NextResponse.json(
        { error: 'Server error', requestId },
        { status: 500 }
      )
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

    const project = Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects
    const buildingName = project?.name || 'ללא שם בניין'

    const { error: logError } = await supabaseAdmin
      .from('ticket_logs')
      .insert({
        ticket_id,
        action_type: 'ASSIGNED_TO_WORKER',
        notes: `Ticket assigned to worker ${worker.full_name}`,
        created_by: 'system',
        meta: {
          worker_id: worker.id,
          worker_name: worker.full_name,
        },
      })

    if (logError) {
      logger.warn('TICKET_API', 'ticket_logs insert failed (non-blocking)', { requestId, err: logError.message })
    }

    const workerPhones = collectWorkerPhones(worker as { phone?: string | null; extra_phones?: string[] | null })
    if (workerPhones.length > 0) {
      try {
        const workerToken = (worker as { access_token?: string | null }).access_token?.trim()
        const portalUrl = workerToken ? getWorkerPortalUrl(workerToken) : null
        const smsMessage = portalUrl
          ? `שויכת לתקלה #${ticket.ticket_number} ב${buildingName}: ${ticket.description || 'ללא תיאור'}. האזור האישי: ${portalUrl}`
          : `שויכת לתקלה #${ticket.ticket_number} ב${buildingName}: ${ticket.description || 'ללא תיאור'}. בקשו מהמשרד קישור לאזור האישי.`
        const batch = await sendWorkerSMSAll(workerPhones, smsMessage, smsSenderName, clientId)
        workerSmsSent = batch.ok
        if (batch.ok) {
          logger.info('TICKET_API', 'Worker SMS sent', {
            requestId,
            ticket_id,
            worker_id,
            phone_count: batch.total,
          })
        } else if (batch.sent > 0) {
          workerSmsNote = `SMS נשלח ל-${batch.sent} מתוך ${batch.total} מספרים. בדקו מספרים נוספים והגדרות 019SMS.`
          logger.warn('TICKET_API', 'Worker SMS partial failure', {
            requestId,
            ticket_id,
            worker_id,
            sent: batch.sent,
            total: batch.total,
          })
        } else {
          workerSmsNote = 'שליחת SMS לעובד נכשלה (019SMS / פורמט מספר / הרשאות). בדקו לוגים ב-Vercel והגדרות SMS_019_*.'
          logger.warn('TICKET_API', 'Worker SMS failed', { requestId, ticket_id, worker_id })
        }
      } catch (sendError) {
        workerSmsSent = false
        workerSmsNote = 'שגיאה בשליחת SMS לעובד.'
        logger.warn('TICKET_API', 'Worker SMS error', { requestId, err: sendError instanceof Error ? sendError.message : String(sendError) })
      }
    } else {
      workerSmsSent = null
      workerSmsNote = 'לעובד אין מספר טלפון במערכת — לא נשלח SMS.'
    }

    try {
      await notifyWorkerAssignedPush(
        supabaseAdmin,
        worker_id,
        clientId,
        ticket.ticket_number as number,
        (ticket.description as string | null) ?? null,
        ticket_id
      )
    } catch {
      /* non-blocking */
    }

    return NextResponse.json({
      success: true,
      ticket: updatedTicket,
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

