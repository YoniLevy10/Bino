import { NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { requireSessionClientId } from '@/lib/api-auth'
import { sanitizeId } from '@/lib/api-validation'
import { createTicketJsonBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit, checkIpPostRouteLimit } from '@/lib/rate-limit'
import { notifyNewTicketPush } from '@/lib/push-notifications'
import { whatsappDbPhoneKey } from '@/lib/whatsapp-test-phone'
import { queuePendingResidentApproval } from '@/lib/pending-resident-from-ticket'
import { autoAssignTicketFromProject } from '@/lib/assign-ticket-worker'

function parseStartCode(message: string) {
  const match = message.trim().toUpperCase().match(/^START_(BMK\d+)(?:_(.+))?$/i)

  if (!match) return null

  return {
    projectCode: match[1],
    buildingNumber: match[2] ? match[2].trim() : null,
  }
}

type TicketRequestBody = {
  message?: unknown
  phone?: unknown
  description?: unknown
  reporter_name?: unknown
  reporter_phone?: unknown
  source?: unknown
  project_code?: unknown
  building_number?: unknown
  /** דיווח ציבורי: מזהה לקוח מהקישור (?client=) */
  client_id?: unknown
}

async function uploadAttachments(
  supabaseAdmin: SupabaseClient,
  ticketId: string,
  files: File[]
): Promise<{ success: number; failed: number; warning?: string }> {
  let successCount = 0
  let failCount = 0

  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']

  for (const file of files) {
    try {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        console.error(`❌ File ${file.name} exceeds 5MB limit (size: ${file.size} bytes)`)
        failCount++
        continue
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        console.error(`❌ File type ${file.type} not allowed for ${file.name}`)
        failCount++
        continue
      }

      // Generate unique file path
      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substring(7)
      const extension = file.name.split('.').pop()
      const filePath = `${ticketId}/${timestamp}-${randomStr}.${extension}`

      // Upload to Supabase Storage
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      const { error: uploadError } = await supabaseAdmin.storage
        .from('ticket-attachments')
        .upload(filePath, uint8Array, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        console.error(`❌ Failed to upload file ${file.name} to storage:`, {
          error: uploadError,
          filePath,
          ticketId,
          fileSize: file.size,
          mimeType: file.type,
        })
        failCount++
        continue
      }

      // Create attachment record in database
      const { error: dbError } = await supabaseAdmin
        .from('ticket_attachments')
        .insert({
          ticket_id: ticketId,
          file_name: file.name,
          file_url: filePath,
          file_size: file.size,
          mime_type: file.type,
          attachment_type: 'web_upload',
        })

      if (dbError) {
        console.error(`❌ Failed to create attachment record for ${file.name}:`, {
          error: dbError.message,
          code: dbError.code,
          details: dbError.details,
          ticketId,
          filePath,
        })
        // Try to delete the uploaded file to avoid orphaned storage
        await supabaseAdmin.storage.from('ticket-attachments').remove([filePath])
        failCount++
        continue
      }

      successCount++
    } catch (err) {
      console.error(`❌ Unexpected error uploading ${file.name}:`, err)
      failCount++
    }
  }

  const warning =
    failCount > 0
      ? `⚠️ ${failCount} of ${files.length} image(s) failed to upload. Ticket created successfully.`
      : undefined

  return { success: successCount, failed: failCount, warning }
}

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `ticket-${Date.now()}`
  
  try {
    logger.debug('TICKET_API', 'Incoming request', { requestId })
    
    let supabaseAdmin
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (envError) {
      console.error('❌ Environment configuration error:', envError)
      logger.error('TICKET_API', 'Environment config error', envError as Error, { requestId })
      return NextResponse.json(
        {
          error: 'Server configuration error. Required environment variables are not set.',
          details: process.env.NODE_ENV === 'development' ? String(envError) : undefined,
        },
        { status: 500 }
      )
    }

    // Check if request has FormData (multipart) or JSON
    const contentType = req.headers.get('content-type') || ''
    let body: TicketRequestBody
    let files: File[] = []

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()

      // Extract text fields
      body = {
        message: formData.get('message') || '',
        phone: formData.get('phone') || '',
        description: formData.get('description') || '',
        reporter_name: formData.get('reporter_name') || '',
        reporter_phone: formData.get('reporter_phone') || '',
        source: formData.get('source') || '',
        project_code: formData.get('project_code') || '',
        building_number: formData.get('building_number') || '',
        client_id: formData.get('client_id') || '',
      }

      // Extract file attachments
      const attachmentFiles = formData.getAll('attachments')
      files = attachmentFiles.filter((f) => f instanceof File) as File[]
    } else {
      const rawJson = await req.json()
      const jp = createTicketJsonBodySchema.safeParse(rawJson)
      if (!jp.success) {
        return NextResponse.json({ error: jp.error.flatten() }, { status: 400 })
      }
      body = jp.data as unknown as TicketRequestBody
    }

    const message = body?.message ? String(body.message).trim() : ''
    const phone = body?.phone ? String(body.phone).trim() : ''
    const description = body?.description ? String(body.description).trim() : ''
    const reporterName = body?.reporter_name ? String(body.reporter_name).trim() : null
    const reporterPhone = body?.reporter_phone ? String(body.reporter_phone).trim() : null
    const source = body?.source ? String(body.source).trim() : 'web_form'
    const projectCodeFromBody = body?.project_code
      ? String(body.project_code).trim().toUpperCase()
      : ''
    const buildingNumberFromBody = body?.building_number
      ? String(body.building_number).trim()
      : null

    const auth = await requireSessionClientId()
    let bamakorClientId: string | null = null
    if (auth.ok) {
      bamakorClientId = auth.ctx.clientId
    } else {
      const fromBody = sanitizeId(body?.client_id)
      if (fromBody) bamakorClientId = fromBody
      else if (process.env.NODE_ENV === 'development') {
        const env = (process.env.BAMAKOR_CLIENT_ID || '').trim()
        if (env) bamakorClientId = env
      }
    }
    if (!bamakorClientId) {
      return NextResponse.json(
        { error: 'נדרשת התחברות או קישור דיווח תקין (מזהה לקוח חסר)' },
        { status: 401 }
      )
    }

    const ipFwd =
      (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() ||
      (req as Request & { ip?: string }).ip ||
      'unknown'

    if (auth.ok) {
      const ux = await checkAuthenticatedPostRouteLimit(supabaseAdmin, auth.ctx.userId, 'create-ticket')
      if (ux.isLimited) {
        return NextResponse.json({ error: 'יותר מדי בקשות, נסה שוב בעוד דקה' }, { status: 429 })
      }
    } else {
      const ax = await checkIpPostRouteLimit(supabaseAdmin, ipFwd, 'create-ticket')
      if (ax.isLimited) {
        return NextResponse.json({ error: 'יותר מדי בקשות, נסה שוב בעוד דקה' }, { status: 429 })
      }
    }

    // MODE 1: WEB FORM
    if (projectCodeFromBody) {
      if (description.length < 3) {
        return NextResponse.json(
          { error: 'description must be at least 3 characters' },
          { status: 400 }
        )
      }

      const { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .select('id, name, project_code, client_id')
        .eq('project_code', projectCodeFromBody)
        .eq('client_id', bamakorClientId)
        .maybeSingle()

      if (projectError) {
        console.error('❌ Failed to fetch project:', projectError)
        return NextResponse.json(
          { error: 'Failed to fetch project' },
          { status: 500 }
        )
      }

      if (!project) {
        return NextResponse.json({ error: 'לא נמצא פרויקט' }, { status: 404 })
      }

      const storedReporterPhone = reporterPhone ? whatsappDbPhoneKey(reporterPhone) : null

      const { data: createdTicket, error: ticketError } = await supabaseAdmin
        .from('tickets')
        .insert({
          project_id: project.id,
          client_id: project.client_id,
          reporter_name: reporterName,
          reporter_phone: storedReporterPhone,
          description,
          status: 'NEW',
          priority: 'MEDIUM',
          source,
          language: 'he',
          building_number: buildingNumberFromBody,
        })
        .select('id, ticket_number, project_id, status, building_number')
        .single()

      if (ticketError) {
        console.error('❌ Failed to create ticket from web form:', ticketError)
        logger.error('TICKET_API', 'Failed to create ticket from web form', ticketError as Error, { 
          requestId, 
          projectCode: projectCodeFromBody,
          clientId: project.client_id 
        })
        audit.logFailedOperation('CREATE', 'TICKET', 'unknown', project.client_id, ticketError.message)
        return NextResponse.json(
          { error: ticketError.message || 'Failed to create ticket' },
          { status: 500 }
        )
      }

      // Log audit trail
      audit.logTicketCreated(project.client_id, createdTicket.id, 'web_form')
      logger.info('TICKET_API', 'Ticket created from web form', { 
        requestId, 
        ticketId: createdTicket.id, 
        ticketNumber: createdTicket.ticket_number,
        clientId: project.client_id 
      })

      const { error: logError } = await supabaseAdmin
        .from('ticket_logs')
        .insert({
          ticket_id: createdTicket.id,
          action_type: 'CREATED_FROM_WEB_FORM',
          notes: `Ticket created from web form for project ${project.project_code}`,
          created_by: 'system',
          meta: {
            source: 'web_form',
            project_code: project.project_code,
            reporter_name: reporterName,
            building_number: buildingNumberFromBody,
          },
        })

      if (logError) {
        console.error('⚠️ Ticket log insert failed (non-blocking):', logError)
      }

      if (reporterPhone) {
        await queuePendingResidentApproval({
          supabase: supabaseAdmin,
          clientId: project.client_id as string,
          projectId: project.id as string,
          ticketId: createdTicket.id,
          waFrom: reporterPhone,
        })
      }

      // Handle file attachments if present
      let imageUploadWarning: string | undefined
      if (files.length > 0) {
        const uploadResult = await uploadAttachments(supabaseAdmin, createdTicket.id, files)
        imageUploadWarning = uploadResult.warning
      }

      const { data: clientRowWeb } = await supabaseAdmin
        .from('clients')
        .select('sms_sender_name')
        .eq('id', project.client_id)
        .maybeSingle()
      const smsSenderWeb =
        (clientRowWeb as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null

      await autoAssignTicketFromProject(supabaseAdmin, {
        ticketId: createdTicket.id,
        clientId: project.client_id as string,
        projectId: project.id as string,
        ticketNumber: createdTicket.ticket_number as number,
        description,
        smsSenderName: smsSenderWeb,
        projectName: (project as { name?: string }).name ?? null,
      })

      void notifyNewTicketPush(supabaseAdmin, project.client_id as string, description).catch(() => {})

      return NextResponse.json({
        success: true,
        mode: 'created_from_web_form',
        ticketId: createdTicket.id,
        ticketNumber: createdTicket.ticket_number,
        projectCode: project.project_code,
        buildingNumber: createdTicket.building_number,
        imageUploadWarning,
      })
    }

    // MODE 2: WHATSAPP / LEGACY FLOW
    if (!phone) {
      return NextResponse.json(
        { error: 'phone is required' },
        { status: 400 }
      )
    }

    const phoneDbKey = whatsappDbPhoneKey(phone)

    const { data: existingSession, error: sessionLookupError } = await supabaseAdmin
      .from('sessions')
      .select('id, phone_number, project_id, active_ticket_id, is_active')
      .eq('phone_number', phoneDbKey)
      .eq('client_id', bamakorClientId)
      .eq('is_active', true)
      .maybeSingle()

    if (sessionLookupError) {
      return NextResponse.json(
        { error: `Session lookup error: ${sessionLookupError.message}` },
        { status: 500 }
      )
    }

    if (existingSession?.active_ticket_id) {
      const followUpText = description || message || 'ללא תוכן'

      const { data: updatedTicket, error: updateError } = await supabaseAdmin
        .from('tickets')
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSession.active_ticket_id)
        .is('deleted_at', null)
        .select('id, ticket_number, updated_at, status')
        .single()

      if (updateError) {
        return NextResponse.json(
          { error: `Ticket update error: ${updateError.message}` },
          { status: 500 }
        )
      }

      const { error: logError } = await supabaseAdmin
        .from('ticket_logs')
        .insert({
          ticket_id: existingSession.active_ticket_id,
          action_type: 'USER_MESSAGE',
          new_value: followUpText,
          performed_by: phoneDbKey,
          notes: 'Incoming follow-up message from user',
          created_by: 'system',
          meta: {
            source: 'whatsapp_followup',
            phone: phoneDbKey,
          },
        })

      if (logError) {
        return NextResponse.json(
          { error: `Ticket log error: ${logError.message}` },
          { status: 500 }
        )
      }

      const { error: sessionUpdateError } = await supabaseAdmin
        .from('sessions')
        .update({
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', existingSession.id)

      if (sessionUpdateError) {
        return NextResponse.json(
          { error: `Session update error: ${sessionUpdateError.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        mode: 'updated_existing_ticket',
        ticket: updatedTicket,
        session: existingSession,
      })
    }

    if (!message) {
      return NextResponse.json(
        { error: 'message is required when no active session exists' },
        { status: 400 }
      )
    }

    const parsedStart = parseStartCode(message)

    if (!parsedStart) {
      return NextResponse.json(
        { error: 'Invalid project code and no active session found' },
        { status: 400 }
      )
    }

    const { projectCode, buildingNumber } = parsedStart

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, name, project_code, client_id')
      .eq('project_code', projectCode)
      .eq('client_id', bamakorClientId)
      .maybeSingle()

    if (projectError || !project) {
      return NextResponse.json({ error: 'לא נמצא פרויקט' }, { status: 404 })
    }

    const initialDescription = description || 'ללא תיאור'

    const { data: createdTicket, error: ticketError } = await supabaseAdmin
      .from('tickets')
      .insert({
        project_id: project.id,
        client_id: project.client_id,
        reporter_phone: phoneDbKey,
        reporter_name: reporterName,
        description: initialDescription,
        status: 'NEW',
        priority: 'MEDIUM',
        source: 'whatsapp',
        language: 'he',
        building_number: buildingNumber,
      })
      .select('id, ticket_number, project_id, status, building_number')
      .single()

    if (ticketError) {
      logger.error('TICKET_API', 'Failed to create WhatsApp ticket', ticketError as Error, { 
        requestId, 
        phone, 
        projectCode,
        clientId: project.client_id 
      })
      audit.logFailedOperation('CREATE', 'TICKET', 'unknown', project.client_id, ticketError.message)
      return NextResponse.json(
        { error: ticketError.message || 'Failed to create ticket' },
        { status: 500 }
      )
    }

    // Log audit trail
    audit.logTicketCreated(project.client_id, createdTicket.id, 'whatsapp')
    logger.info('TICKET_API', 'Ticket created from WhatsApp', {
      requestId,
      ticketId: createdTicket.id,
      ticketNumber: createdTicket.ticket_number,
      phone: phoneDbKey,
      clientId: project.client_id,
    })

    await queuePendingResidentApproval({
      supabase: supabaseAdmin,
      clientId: project.client_id as string,
      projectId: project.id as string,
      ticketId: createdTicket.id,
      waFrom: phone,
    })

    const { data: createdSession, error: createSessionError } = await supabaseAdmin
      .from('sessions')
      .insert({
        phone_number: phoneDbKey,
        project_id: project.id,
        client_id: project.client_id as string,
        active_ticket_id: createdTicket.id,
        is_active: true,
        last_activity_at: new Date().toISOString(),
      })
      .select('id, phone_number, project_id, active_ticket_id, is_active')
      .single()

    if (createSessionError) {
      return NextResponse.json(
        {
          error: `Session creation error: ${createSessionError.message}`,
          ticket: createdTicket,
        },
        { status: 500 }
      )
    }

    const { error: firstLogError } = await supabaseAdmin
      .from('ticket_logs')
      .insert({
        ticket_id: createdTicket.id,
        action_type: 'TICKET_CREATED',
        new_value: initialDescription,
        performed_by: phoneDbKey,
        notes: 'Initial ticket creation from user',
        created_by: 'system',
        meta: {
          source: 'whatsapp',
          phone: phoneDbKey,
          project_code: project.project_code,
          building_number: buildingNumber,
        },
      })

    if (firstLogError) {
      return NextResponse.json(
        {
          error: `Initial log error: ${firstLogError.message}`,
          ticket: createdTicket,
          session: createdSession,
        },
        { status: 500 }
      )
    }

    const { data: clientRowWa } = await supabaseAdmin
      .from('clients')
      .select('sms_sender_name')
      .eq('id', project.client_id)
      .maybeSingle()
    const smsSenderWa =
      (clientRowWa as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null

    await autoAssignTicketFromProject(supabaseAdmin, {
      ticketId: createdTicket.id,
      clientId: project.client_id as string,
      projectId: project.id as string,
      ticketNumber: createdTicket.ticket_number as number,
      description: initialDescription,
      smsSenderName: smsSenderWa,
      projectName: (project as { name?: string }).name ?? null,
    })

    void notifyNewTicketPush(supabaseAdmin, project.client_id as string, initialDescription).catch(() => {})

    return NextResponse.json({
      success: true,
      mode: 'created_new_ticket_and_session',
      ticket: createdTicket,
      session: createdSession,
      buildingNumber,
    })
  } catch (err) {
    console.error('❌ create-ticket route error:', err)
    const error = err instanceof Error ? err : new Error(String(err))
    logger.error('TICKET_API', 'Unhandled error in create-ticket', error, { requestId })
    return NextResponse.json(
      {
        error: 'Server error',
        details: process.env.NODE_ENV === 'development' ? String(err) : undefined,
      },
      { status: 500 }
    )
  }
}

