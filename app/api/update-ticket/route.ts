import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { sanitizeString } from '@/lib/api-validation'
import { updateTicketBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionMinRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { isTicketStatus } from '@/lib/ticket-status'
import { notifyReporterIfTicketNewlyClosed } from '@/lib/reporter-ticket-closed-notify'

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `update-ticket-${Date.now()}`
  
  logger.info('TICKET_API', 'Update ticket request received', { requestId })
  
  try {
    let supabaseAdmin
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (envError) {
      const error = envError instanceof Error ? envError : new Error(String(envError))
      logger.error('TICKET_API', 'Failed to initialize Supabase admin', error, { requestId })
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const auth = await requireSessionMinRole('manager')
    if (!auth.ok) return auth.response
    const bamakorClientId = auth.ctx.clientId

    const rawBody = await req.json()
    const validated = updateTicketBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }
    const { ticket_id, priority, status, description, assigned_worker_id } = validated.data

    const rl = await checkAuthenticatedPostRouteLimit(supabaseAdmin, auth.ctx.userId, 'update-ticket')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    // Validate ticket exists
    const existsQuery = supabaseAdmin
      .from('tickets')
      .select('id, client_id, priority, status, reporter_phone, projects(name)')
      .eq('id', ticket_id)
      .eq('client_id', bamakorClientId)
      .is('deleted_at', null)
    const { data: ticket, error: ticketError } = await existsQuery.single()

    if (ticketError || !ticket) {
      logger.error('TICKET_API', 'Ticket not found', ticketError, { requestId, ticket_id })
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      )
    }

    const clientId = bamakorClientId

    // Prepare update payload
    const updatePayload: Record<string, unknown> = {}
    if (priority !== undefined && priority !== null) {
      const p = sanitizeString(priority).toUpperCase()
      if (!['HIGH', 'MEDIUM', 'LOW', 'URGENT'].includes(p)) {
        return NextResponse.json({ error: 'עדיפות לא תקינה', requestId }, { status: 400 })
      }
      updatePayload.priority = p
    }
    if (status !== undefined && status !== null) {
      const s = sanitizeString(status).toUpperCase()
      if (!isTicketStatus(s)) {
        return NextResponse.json({ error: 'סטטוס לא תקין', requestId }, { status: 400 })
      }
      updatePayload.status = s
      if (s === 'CLOSED') {
        updatePayload.closed_at = new Date().toISOString()
      } else {
        updatePayload.closed_at = null
      }
    }
    if (description !== undefined) {
      updatePayload.description = sanitizeString(description)
    }
    if (assigned_worker_id !== undefined) {
      updatePayload.assigned_worker_id = assigned_worker_id
    }

    if (Object.keys(updatePayload).length === 0) {
      logger.error('TICKET_API', 'No fields to update', undefined, { requestId, ticket_id })
      return NextResponse.json(
        { error: 'No fields to update', requestId },
        { status: 400 }
      )
    }

    // Update ticket
    const { data: updatedTicket, error: updateError } = await supabaseAdmin
      .from('tickets')
      .update(updatePayload)
      .eq('id', ticket_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .select()

    if (updateError) {
      logger.error('TICKET_API', 'Failed to update ticket', updateError, { requestId, ticket_id, updates: Object.keys(updatePayload) })
      audit.logFailedOperation('UPDATE', 'TICKET', ticket_id, 'unknown', `Update failed: ${updateError.message}`)
      return NextResponse.json(
        { error: 'Server error', requestId },
        { status: 500 }
      )
    }
    
    logger.info('TICKET_API', 'Ticket updated successfully', { requestId, ticket_id, updates: Object.keys(updatePayload) })

    if (priority !== undefined && priority !== null) {
      await logAudit({
        clientId,
        userId: auth.ctx.userId,
        action: 'UPDATE_TICKET_PRIORITY',
        entityType: 'ticket',
        entityId: ticket_id,
        oldValues: { priority: (ticket as { priority?: string | null }).priority ?? null },
        newValues: { priority: sanitizeString(priority).toUpperCase() },
      })
    }

    const previousStatus = (ticket as { status?: string | null }).status
    const closedNow =
      status !== undefined &&
      status !== null &&
      sanitizeString(status).toUpperCase() === 'CLOSED' &&
      previousStatus !== 'CLOSED'

    let reporterHasPhone = false
    let whatsappSent = false

    if (closedNow) {
      const notify = await notifyReporterIfTicketNewlyClosed(
        supabaseAdmin,
        clientId,
        ticket_id,
        previousStatus
      )
      reporterHasPhone = Boolean((ticket as { reporter_phone?: string | null }).reporter_phone?.trim())
      whatsappSent = notify?.whatsappSent ?? false
      logger.info('TICKET_API', 'Reporter WhatsApp on close (update-ticket)', {
        requestId,
        ticket_id,
        whatsappSent,
      })
      if (notify?.whatsappError) {
        logger.warn('TICKET_API', 'Reporter WhatsApp on close failed (update-ticket)', {
          requestId,
          ticket_id,
          error: notify.whatsappError,
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedTicket,
      requestId,
      ...(closedNow
        ? {
            closed_now: true,
            reporter_has_phone: reporterHasPhone,
            whatsapp_sent: whatsappSent,
          }
        : {}),
    })
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('[update-ticket]', error)
    logger.error('TICKET_API', 'Update ticket route error', err, { requestId })
    return NextResponse.json(
      { error: 'internal', requestId },
      { status: 500 }
    )
  }
}
