import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchWithTimeout } from '@/lib/fetch-timeout'
import {
  getFixlyApiKey,
  getFixlyBaseUrl,
  inferCityFromAddress,
  isFixlyConfigured,
  mapBamakorPriorityToFixly,
  mapToFixlyCategory,
  truncateTitle,
  type FixlyAssignmentMode,
  type FixlyCategory,
  type FixlyPriority,
} from '@/lib/fixly'
import { getLogger } from '@/lib/logging'

export type CreateFixlyJobInput = {
  ticketId: string
  clientId: string
  category?: string | null
  priority?: FixlyPriority | null
  notes?: string | null
  assignmentMode?: FixlyAssignmentMode | null
  cityOverride?: string | null
  managerPhoneOverride?: string | null
  reporterPhoneOverride?: string | null
}

export type CreateFixlyJobResult =
  | {
      ok: true
      already_published?: boolean
      job_id: string
      status: string
      matched_providers?: number
    }
  | { ok: false; error: string; detail?: string; status?: number }

type ProjectJoin = {
  name?: string | null
  address?: string | null
  manager_phone?: string | null
  project_code?: string | null
} | null

type ClientJoin = {
  name?: string | null
  manager_phone?: string | null
} | null

export async function createFixlyJobForTicket(
  supabase: SupabaseClient,
  input: CreateFixlyJobInput
): Promise<CreateFixlyJobResult> {
  const logger = getLogger()

  if (!isFixlyConfigured()) {
    return { ok: false, error: 'fixly_not_configured', detail: 'חסרים FIXLY_API_KEY או BAMAKOR_WEBHOOK_SECRET', status: 503 }
  }

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select(
      `
      id,
      ticket_number,
      client_id,
      description,
      priority,
      status,
      reporter_phone,
      image_url,
      fixly_job_id,
      fixly_status,
      projects ( name, address, manager_phone, project_code ),
      clients ( name, manager_phone )
    `
    )
    .eq('id', input.ticketId)
    .eq('client_id', input.clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (ticketError || !ticket) {
    return { ok: false, error: 'ticket_not_found', status: 404 }
  }

  if (ticket.status === 'CLOSED') {
    return { ok: false, error: 'ticket_closed', detail: 'לא ניתן לפרסם תקלה סגורה', status: 400 }
  }

  if (ticket.fixly_job_id) {
    return {
      ok: true,
      already_published: true,
      job_id: ticket.fixly_job_id as string,
      status: (ticket.fixly_status as string) || 'offered',
    }
  }

  const project = (Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects) as ProjectJoin
  const client = (Array.isArray(ticket.clients) ? ticket.clients[0] : ticket.clients) as ClientJoin

  const { data: attachments } = await supabase
    .from('ticket_attachments')
    .select('file_url')
    .eq('ticket_id', input.ticketId)
    .not('file_url', 'is', null)
    .limit(20)

  const mediaUrls = [
    ...((attachments || [])
      .map((a) => (a.file_url as string | null)?.trim())
      .filter((u): u is string => !!u)),
    ...((ticket.image_url as string | null)?.trim() ? [ticket.image_url as string] : []),
  ]
  const uniqueMedia = [...new Set(mediaUrls)]

  const category: FixlyCategory = mapToFixlyCategory(input.category)
  const priority: FixlyPriority =
    input.priority || mapBamakorPriorityToFixly(ticket.priority as string | null)
  const assignmentMode: FixlyAssignmentMode = input.assignmentMode || 'broadcast_first_accept'

  const address = project?.address?.trim() || project?.name?.trim() || ''
  const city =
    (input.cityOverride || '').trim() ||
    inferCityFromAddress(address) ||
    project?.name?.trim() ||
    ''

  const managerPhone =
    (input.managerPhoneOverride || '').trim() ||
    project?.manager_phone?.trim() ||
    client?.manager_phone?.trim() ||
    null

  const reporterPhone =
    (input.reporterPhoneOverride || '').trim() ||
    (ticket.reporter_phone as string | null)?.trim() ||
    null

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  if (!appUrl) {
    return { ok: false, error: 'missing_app_url', detail: 'NEXT_PUBLIC_APP_URL לא מוגדר', status: 500 }
  }

  const title = truncateTitle(ticket.description as string | null)
  const payload = {
    source: 'bamakor',
    external_ref: {
      system: 'bamakor',
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number ?? null,
      client_id: ticket.client_id ?? null,
      client_name: client?.name ?? null,
    },
    category,
    title,
    description: (ticket.description as string | null) || title,
    priority,
    location: {
      building_name: project?.name ?? null,
      address: address || null,
      city,
    },
    contact: {
      reporter_phone: reporterPhone,
      manager_phone: managerPhone,
      notes: input.notes?.trim() || null,
    },
    media_urls: uniqueMedia,
    assignment_mode: assignmentMode,
    callback_url: `${appUrl}/api/integrations/fixly/webhook`,
  }

  const fixlyUrl = `${getFixlyBaseUrl()}/api/v1/jobs`
  const fixlyRes = await fetchWithTimeout(
    fixlyUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getFixlyApiKey()}`,
        ...(ticket.client_id ? { 'X-Bamakor-Client-Id': ticket.client_id as string } : {}),
      },
      body: JSON.stringify(payload),
    },
    15_000
  )

  if (!fixlyRes) {
    return { ok: false, error: 'fixly_timeout', detail: 'אין תשובה מ-Fixly', status: 504 }
  }

  let result: {
    ok?: boolean
    job_id?: string
    status?: string
    matched_providers?: number
    error?: string
    message?: string
  } = {}
  try {
    result = (await fixlyRes.json()) as typeof result
  } catch {
    return { ok: false, error: 'fixly_invalid_json', status: fixlyRes.status || 502 }
  }

  if (!fixlyRes.ok || !result.ok || !result.job_id) {
    logger.warn('FIXLY', 'create-job rejected', {
      status: fixlyRes.status,
      error: result.error,
      message: result.message,
    })
    return {
      ok: false,
      error: result.error || 'fixly_error',
      detail: result.message || undefined,
      status: fixlyRes.status || 502,
    }
  }

  const syncedAt = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('tickets')
    .update({
      fixly_job_id: result.job_id,
      fixly_status: result.status || 'offered',
      fixly_synced_at: syncedAt,
      updated_at: syncedAt,
    })
    .eq('id', input.ticketId)
    .eq('client_id', input.clientId)

  if (updateErr) {
    logger.error('FIXLY', 'Failed to persist fixly_job_id', updateErr, { ticketId: input.ticketId })
    return { ok: false, error: 'persist_failed', detail: updateErr.message, status: 500 }
  }

  const { error: logErr } = await supabase.from('ticket_logs').insert({
    ticket_id: input.ticketId,
    action_type: 'FIXLY_PUBLISHED',
    notes: `פורסם ב-Fixly — סטטוס: ${result.status || 'offered'}`,
    created_by: 'system',
    new_value: result.status || 'offered',
    meta: {
      job_id: result.job_id,
      matched_providers: result.matched_providers ?? null,
      category,
      priority,
      assignment_mode: assignmentMode,
    },
  })

  if (logErr) {
    logger.warn('FIXLY', 'ticket_logs insert failed', { err: logErr.message })
  }

  return {
    ok: true,
    job_id: result.job_id,
    status: result.status || 'offered',
    matched_providers: result.matched_providers,
  }
}
