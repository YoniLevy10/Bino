import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/residents-whatsapp'

export type WhatsAppInboxContext = {
  building_name: string | null
  open_ticket: {
    ticket_number: number
    description: string
  } | null
  /** Latest closed ticket — useful when manager wants to notify after close */
  recent_closed_ticket: {
    ticket_number: number
    description: string
    building_name: string
  } | null
}

function projectNameFromJoin(
  projects: { name?: string | null } | { name?: string | null }[] | null | undefined
): string | null {
  const name = Array.isArray(projects) ? projects[0]?.name : projects?.name
  const trimmed = name?.trim()
  return trimmed || null
}

export async function loadWhatsAppInboxContext(
  admin: SupabaseClient,
  clientId: string,
  opts: { phone: string; residentId?: string | null }
): Promise<WhatsAppInboxContext> {
  const normalizedPhone = normalizePhone(opts.phone)
  let building_name: string | null = null

  if (opts.residentId) {
    const { data: residentRow } = await admin
      .from('residents')
      .select('projects(name)')
      .eq('id', opts.residentId)
      .eq('client_id', clientId)
      .maybeSingle()

    building_name = projectNameFromJoin(
      (residentRow as { projects?: { name?: string | null } | { name?: string | null }[] } | null)?.projects
    )
  }

  const ticketSelect = 'ticket_number, description, status, projects(name)'

  const { data: openRows } = await admin
    .from('tickets')
    .select(ticketSelect)
    .eq('client_id', clientId)
    .eq('reporter_phone', normalizedPhone)
    .neq('status', 'CLOSED')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const openRow = openRows?.[0] as
    | {
        ticket_number: number
        description: string | null
        projects?: { name?: string | null } | { name?: string | null }[]
      }
    | undefined

  const open_ticket = openRow
    ? {
        ticket_number: openRow.ticket_number,
        description: (openRow.description || 'ללא תיאור').trim().slice(0, 120),
      }
    : null

  if (!building_name && openRow) {
    building_name = projectNameFromJoin(openRow.projects)
  }

  const { data: closedRows } = await admin
    .from('tickets')
    .select(ticketSelect)
    .eq('client_id', clientId)
    .eq('reporter_phone', normalizedPhone)
    .eq('status', 'CLOSED')
    .is('deleted_at', null)
    .order('closed_at', { ascending: false })
    .limit(1)

  const closedRow = closedRows?.[0] as
    | {
        ticket_number: number
        description: string | null
        projects?: { name?: string | null } | { name?: string | null }[]
      }
    | undefined

  const closedBuilding = closedRow ? projectNameFromJoin(closedRow.projects) : null
  if (!building_name && closedBuilding) {
    building_name = closedBuilding
  }

  const recent_closed_ticket = closedRow
    ? {
        ticket_number: closedRow.ticket_number,
        description: (closedRow.description || 'ללא תיאור').trim().slice(0, 120),
        building_name: closedBuilding || building_name || 'הבניין',
      }
    : null

  return {
    building_name,
    open_ticket,
    recent_closed_ticket,
  }
}

/** Build template param values from server context — managers rarely need to type anything. */
export function inboxTemplateParamsFromContext(
  templateId: string,
  ctx: WhatsAppInboxContext
): string[] {
  if (templateId === 'ticket_closed') {
    const building =
      ctx.building_name ||
      ctx.recent_closed_ticket?.building_name ||
      'הבניין'
    return [building.slice(0, 60)]
  }
  if (templateId === 'sla_escalation') {
    const t = ctx.open_ticket
    if (!t) return ['', '']
    return [String(t.ticket_number), t.description]
  }
  return []
}
