import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { getLogger } from '@/lib/logging'
import { notifyReporterTicketClosed } from '@/lib/reporter-ticket-closed-notify'
import { ticketIdBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { sendManagerSMS, getManagerPhoneFromEnv } from '@/lib/sms-send'
import { resolveSmsTemplateMessage } from '@/lib/whatsapp-templates'
import { SMS_TEMPLATE_EDITOR_DEFAULTS } from '@/lib/whatsapp-template-keys'

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `close-ticket-${Date.now()}`
  
  logger.info('TICKET_API', 'Close ticket request received', { requestId })
  
  try {
    let supabaseAdmin
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (envError) {
      const error = envError instanceof Error ? envError : new Error(String(envError))
      logger.error('TICKET_API', 'Failed to initialize Supabase admin', error, { requestId })
      console.error('❌ Environment configuration error:', envError)
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const bamakorClientId = auth.ctx.clientId

    const rawBody = await req.json()
    const validated = ticketIdBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }
    const { ticket_id } = validated.data

    const rl = await checkAuthenticatedPostRouteLimit(supabaseAdmin, auth.ctx.userId, 'close-ticket')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const ticketQuery = supabaseAdmin
      .from('tickets')
      .select('id, status, reporter_phone, project_id, client_id, projects (name)')
      .eq('id', ticket_id)
      .eq('client_id', bamakorClientId)
      .is('deleted_at', null)

    const { data: ticket, error: ticketError } = await ticketQuery.single()

    if (ticketError || !ticket) {
      console.warn('Ticket not found:', ticket_id)
      logger.error('TICKET_API', 'Ticket not found', ticketError, { requestId, ticket_id })
      return NextResponse.json(
        { error: 'Ticket not found', requestId },
        { status: 404 }
      )
    }

    if (ticket.status === 'CLOSED') {
      logger.warn('TICKET_API', 'Ticket already closed', { requestId, ticket_id })
      return NextResponse.json(
        { error: 'Ticket is already closed', code: 'ALREADY_CLOSED', requestId },
        { status: 409 }
      )
    }

    const clientId = bamakorClientId

    const { data: updatedTicket, error: updateError } = await supabaseAdmin
      .from('tickets')
      .update({
        status: 'CLOSED',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket_id)
      .eq('client_id', clientId)
      .select()
      .single()

    if (updateError) {
      logger.error('TICKET_API', 'Failed to close ticket', updateError, { requestId, ticket_id })
      console.error('Failed to update ticket:', updateError)
      return NextResponse.json(
        {
          error: 'Failed to close ticket',
          requestId,
        },
        { status: 500 }
      )
    }
    
    logger.info('TICKET_API', 'Ticket closed successfully', { requestId, ticket_id })

    await logAudit({
      clientId,
      userId: auth.ctx.userId,
      action: 'CLOSE_TICKET',
      entityType: 'ticket',
      entityId: ticket_id,
      oldValues: { status: ticket.status },
      newValues: { status: 'CLOSED', closed_at: new Date().toISOString() },
    })

    type TicketWithProject = {
      reporter_phone?: string | null
      project_id?: string | null
      projects?: { name?: string | null } | { name?: string | null }[] | null
    }
    const trow = ticket as TicketWithProject
    const proj = trow.projects
    const projectName = Array.isArray(proj) ? proj[0]?.name : proj?.name

    // Send manager SMS on close if enabled in client settings
    try {
      const { data: clientRow } = await supabaseAdmin
        .from('clients')
        .select('sms_on_ticket_close, manager_phone, sms_sender_name')
        .eq('id', clientId)
        .maybeSingle()
      const smsOnClose = (clientRow as { sms_on_ticket_close?: boolean | null } | null)?.sms_on_ticket_close !== false
      if (smsOnClose) {
        const managerPhone = (clientRow as { manager_phone?: string | null } | null)?.manager_phone?.trim() || getManagerPhoneFromEnv()
        const smsSenderName = (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name || null
        if (managerPhone) {
          const smsMsg = await resolveSmsTemplateMessage(
            supabaseAdmin, clientId,
            'sms_manager_ticket_closed',
            SMS_TEMPLATE_EDITOR_DEFAULTS.sms_manager_ticket_closed,
            { project_name: projectName || 'הבניין', ticket_number: String(ticket_id) }
          )
          await sendManagerSMS(managerPhone, smsMsg, smsSenderName, clientId)
        }
      }
    } catch (smsErr) {
      logger.warn('TICKET_API', 'Manager SMS on close failed', { requestId, ticket_id, err: String(smsErr) })
    }

    const notify = await notifyReporterTicketClosed(supabaseAdmin, clientId, {
      reporterPhone: trow.reporter_phone,
      projectName: projectName || 'הבניין',
    })
    logger.info('TICKET_API', 'Reporter WhatsApp on close', {
      requestId,
      ticket_id,
      whatsappSent: notify.whatsappSent,
    })
    if (notify.whatsappError) {
      logger.warn('TICKET_API', 'Reporter WhatsApp on close failed', {
        requestId,
        ticket_id,
        error: notify.whatsappError,
      })
    }

    const { error: sessionError } = await supabaseAdmin
      .from('sessions')
      .update({
        active_ticket_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('active_ticket_id', ticket_id)
      .eq('client_id', clientId)

    if (sessionError) {
      console.error('⚠️ Failed to clear session:', sessionError)
      logger.warn('TICKET_API', 'Failed to clear session after closing ticket', { requestId, ticket_id, error: sessionError.message })
    }

    const { error: logError } = await supabaseAdmin.from('ticket_logs').insert([
      {
        ticket_id,
        action_type: 'TICKET_CLOSED',
        performed_by: 'system',
        notes: 'Ticket closed successfully',
        created_at: new Date().toISOString(),
      },
    ])

    if (logError) {
      console.error('⚠️ Failed to insert close log:', logError)
      logger.warn('TICKET_API', 'Failed to insert close log', { requestId, ticket_id, error: logError.message })
    }

    return NextResponse.json({
      success: true,
      ticket: updatedTicket,
      reporter_has_phone: Boolean(trow.reporter_phone?.trim()),
      whatsapp_sent: notify.whatsappSent,
      requestId,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('[close-ticket]', error)
    logger.error('TICKET_API', 'Close ticket route error', err, { requestId })
    return NextResponse.json(
      {
        error: 'internal',
        requestId,
      },
      { status: 500 }
    )
  }
}