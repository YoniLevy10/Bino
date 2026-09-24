import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { getLogger } from '@/lib/logging'
import { launchFixlyBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { createFixlyOpenJob } from '@/lib/fixly-client'
import { mergeFixlyMetadata, readFixlyMetadata } from '@/lib/fixly-ticket-metadata'
import { createServerSignedAttachmentUrl } from '@/lib/ticket-attachment-url'

export const maxDuration = 60

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `launch-fixly-${Date.now()}`

  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    const rawBody = await req.json()
    const validated = launchFixlyBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const { ticket_id, trade, priority: priorityOverride } = validated.data
    const admin = getSupabaseAdmin()
    const clientId = auth.ctx.clientId

    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'launch-fixly')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const { data: ticket, error: ticketError } = await admin
      .from('tickets')
      .select(
        `
        id,
        ticket_number,
        description,
        priority,
        reporter_name,
        reporter_phone,
        building_number,
        project_id,
        ticket_metadata,
        status,
        projects (id, name, address)
      `
      )
      .eq('id', ticket_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'תקלה לא נמצאה', requestId }, { status: 404 })
    }

    const existing = readFixlyMetadata(ticket.ticket_metadata)
    if (existing && existing.last_status !== 'cancelled' && existing.last_status !== 'expired' && existing.last_status !== 'completed') {
      return NextResponse.json(
        {
          error: 'כבר הוזנקה קריאת Fixly לתקלה זו',
          fixly: existing,
          requestId,
        },
        { status: 409 }
      )
    }

    const project = Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects
    const buildingName = (project as { name?: string | null } | null)?.name?.trim() || null
    const address = (project as { address?: string | null } | null)?.address?.trim() || buildingName || 'ללא כתובת'
    const projectId = (ticket.project_id as string) || (project as { id?: string } | null)?.id
    if (!projectId) {
      return NextResponse.json({ error: 'לתקלה אין פרויקט משויך', requestId }, { status: 400 })
    }

    const { data: attachments } = await admin
      .from('ticket_attachments')
      .select('file_url')
      .eq('ticket_id', ticket_id)
      .limit(8)

    const mediaUrls: string[] = []
    for (const row of attachments || []) {
      const path = typeof row.file_url === 'string' ? row.file_url : ''
      if (!path) continue
      const signed = await createServerSignedAttachmentUrl(admin, path)
      if (signed) mediaUrls.push(signed)
    }

    const createResult = await createFixlyOpenJob({
      bino_ticket_id: ticket_id,
      bino_ticket_number: ticket.ticket_number as number,
      client_id: clientId,
      project_id: projectId,
      trade: trade.trim(),
      description: ((ticket.description as string | null) || 'ללא תיאור').slice(0, 2000),
      priority: (priorityOverride || (ticket.priority as string) || 'MEDIUM').toUpperCase(),
      address,
      building_name: buildingName,
      building_number: (ticket.building_number as string | null) || null,
      contact_name: (ticket.reporter_name as string | null) || null,
      contact_phone: (ticket.reporter_phone as string | null) || null,
      media_urls: mediaUrls,
    })

    if (!createResult.ok) {
      return NextResponse.json({ error: createResult.error, requestId }, { status: 502 })
    }

    const now = new Date().toISOString()
    const nextMeta = mergeFixlyMetadata(ticket.ticket_metadata, {
      job_id: createResult.data.fixly_job_id,
      launched_at: now,
      last_status: createResult.data.status,
      trade: trade.trim(),
    })

    const { error: updateError } = await admin
      .from('tickets')
      .update({
        ticket_metadata: nextMeta,
        status: 'PROFESSIONAL_ESCORT',
        updated_at: now,
      })
      .eq('id', ticket_id)
      .eq('client_id', clientId)

    if (updateError) {
      logger.warn('FIXLY', 'ticket update failed after launch', { err: updateError.message, requestId })
      return NextResponse.json({ error: 'שמירת סטטוס נכשלה', requestId }, { status: 500 })
    }

    await admin.from('ticket_logs').insert({
      ticket_id,
      action_type: 'LAUNCHED_FIXLY',
      notes: `הוזנקה קריאת Fixly (${trade.trim()})${createResult.stub ? ' [stub]' : ''}`,
      created_by: 'system',
      meta: {
        fixly_job_id: createResult.data.fixly_job_id,
        trade: trade.trim(),
        stub: createResult.stub,
      },
    })

    logger.info('FIXLY', 'Job launched', {
      requestId,
      ticket_id,
      job_id: createResult.data.fixly_job_id,
      stub: createResult.stub,
    })

    return NextResponse.json({
      success: true,
      fixly_job_id: createResult.data.fixly_job_id,
      status: createResult.data.status,
      stub: createResult.stub,
      requestId,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('FIXLY', 'launch-fixly error', err, { requestId })
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}
