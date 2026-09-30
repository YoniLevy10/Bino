import type { SupabaseClient } from '@supabase/supabase-js'
import { queuePendingResidentApproval } from '@/lib/pending-resident-from-ticket'
import { autoAssignTicketFromProject } from '@/lib/assign-ticket-worker'
import { runAfterResponse } from '@/lib/run-after-response'
import { notifyNewTicketPush } from '@/lib/push-notifications'
import { uploadTicketAttachments } from '@/lib/ticket-attachment-upload'
import { whatsappDbPhoneKey } from '@/lib/whatsapp-test-phone'
import { checkTicketsMonthlyQuota } from '@/lib/plan-quota-check'
import type { TicketScope } from '@/lib/resident-portal/types'

export type CreateTicketInput = {
  clientId: string
  projectId: string
  description: string
  source: string
  reporterName?: string | null
  reporterPhone?: string | null
  buildingNumber?: string | null
  language?: string
  priority?: string
  residentId?: string | null
  unitId?: string | null
  reporterMembershipId?: string | null
  scope?: TicketScope | null
  portalIdempotencyKey?: string | null
  files?: File[]
  /** When false, skip auto-assign (e.g. private unit tickets). Default true for common/unclear. */
  autoAssign?: boolean
  skipPendingResident?: boolean
}

export type CreateTicketResult = {
  ticketId: string
  ticketNumber: number
  reused: boolean
  imageUploadWarning?: string
  scope: TicketScope | null
}

/**
 * Shared ticket creation used by web form, WhatsApp (gradually), and resident portal.
 * Always uses service_role admin; callers must authorize first.
 */
export async function createTicketShared(
  admin: SupabaseClient,
  input: CreateTicketInput
): Promise<CreateTicketResult> {
  const description = input.description.trim()
  if (description.length < 3) {
    throw new Error('התיאור חייב להכיל לפחות 3 תווים')
  }

  const quota = await checkTicketsMonthlyQuota(admin, input.clientId)
  if (!quota.ok) {
    const err = new Error(quota.error) as Error & { code?: string }
    err.code = 'PLAN_LIMIT'
    throw err
  }

  if (input.portalIdempotencyKey && input.reporterMembershipId) {
    const { data: existing } = await admin
      .from('tickets')
      .select('id, ticket_number, scope')
      .eq('reporter_membership_id', input.reporterMembershipId)
      .eq('portal_idempotency_key', input.portalIdempotencyKey)
      .maybeSingle()
    if (existing) {
      return {
        ticketId: existing.id,
        ticketNumber: existing.ticket_number as number,
        reused: true,
        scope: (existing.scope as TicketScope | null) ?? input.scope ?? null,
      }
    }
  }

  const { data: project, error: pErr } = await admin
    .from('projects')
    .select('id, name, project_code, client_id')
    .eq('id', input.projectId)
    .eq('client_id', input.clientId)
    .maybeSingle()

  if (pErr) throw new Error(pErr.message)
  if (!project) throw new Error('פרויקט לא נמצא')

  const storedReporterPhone = input.reporterPhone
    ? whatsappDbPhoneKey(input.reporterPhone)
    : null

  const scope = input.scope ?? null
  const shouldAutoAssign =
    input.autoAssign ?? (scope !== 'private')

  const insertRow: Record<string, unknown> = {
    project_id: project.id,
    client_id: project.client_id,
    reporter_name: input.reporterName ?? null,
    reporter_phone: storedReporterPhone,
    description,
    status: 'NEW',
    priority: input.priority || 'MEDIUM',
    source: input.source,
    language: input.language || 'he',
    building_number: input.buildingNumber ?? null,
    resident_id: input.residentId ?? null,
    unit_id: input.unitId ?? null,
    reporter_membership_id: input.reporterMembershipId ?? null,
    scope,
    portal_idempotency_key: input.portalIdempotencyKey ?? null,
  }

  const { data: createdTicket, error: ticketError } = await admin
    .from('tickets')
    .insert(insertRow)
    .select('id, ticket_number, project_id, status, building_number, scope')
    .single()

  if (ticketError) {
    // Unique idempotency race
    if (input.portalIdempotencyKey && input.reporterMembershipId) {
      const { data: raced } = await admin
        .from('tickets')
        .select('id, ticket_number, scope')
        .eq('reporter_membership_id', input.reporterMembershipId)
        .eq('portal_idempotency_key', input.portalIdempotencyKey)
        .maybeSingle()
      if (raced) {
        return {
          ticketId: raced.id,
          ticketNumber: raced.ticket_number as number,
          reused: true,
          scope: (raced.scope as TicketScope | null) ?? scope,
        }
      }
    }
    throw new Error(ticketError.message || 'יצירת קריאה נכשלה')
  }

  await admin.from('ticket_logs').insert({
    ticket_id: createdTicket.id,
    action_type: 'CREATED',
    notes: `Ticket created via ${input.source}`,
    created_by: 'system',
    meta: {
      source: input.source,
      scope,
      reporter_membership_id: input.reporterMembershipId ?? null,
    },
  })

  if (input.reporterPhone && !input.skipPendingResident && !input.residentId) {
    await queuePendingResidentApproval({
      supabase: admin,
      clientId: project.client_id as string,
      projectId: project.id as string,
      ticketId: createdTicket.id,
      waFrom: input.reporterPhone,
    })
  }

  let imageUploadWarning: string | undefined
  if (input.files && input.files.length > 0) {
    const uploadResult = await uploadTicketAttachments(
      admin,
      createdTicket.id,
      input.files,
      input.source === 'portal' ? 'web' : 'web'
    )
    imageUploadWarning = uploadResult.warning
  }

  if (shouldAutoAssign) {
    const { data: clientRow } = await admin
      .from('clients')
      .select('sms_sender_name')
      .eq('id', project.client_id)
      .maybeSingle()
    const smsSender =
      (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null

    runAfterResponse('create-ticket-shared-auto-assign', async () => {
      await autoAssignTicketFromProject(admin, {
        ticketId: createdTicket.id,
        clientId: project.client_id as string,
        projectId: project.id as string,
        ticketNumber: createdTicket.ticket_number as number,
        description,
        smsSenderName: smsSender,
        projectName: (project as { name?: string }).name ?? null,
      })
    })
  }

  void notifyNewTicketPush(admin, project.client_id as string, description, {
    ticketNumber: createdTicket.ticket_number as number,
  }).catch(() => {})

  return {
    ticketId: createdTicket.id,
    ticketNumber: createdTicket.ticket_number as number,
    reused: false,
    imageUploadWarning,
    scope: (createdTicket.scope as TicketScope | null) ?? scope,
  }
}
