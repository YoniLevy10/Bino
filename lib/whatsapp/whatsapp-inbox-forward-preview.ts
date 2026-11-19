import type { SupabaseClient } from '@supabase/supabase-js'
import { attachSavedResidentNames } from '@/lib/attach-reporter-names'
import { formatReporterNameAndPhone } from '@/lib/reporter/reporter-display'
import { collectWorkerPhones, type WorkerPhoneSource } from '@/lib/worker/worker-phones'

function truncateForSms(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 3)}...`
}

export type InboxForwardDryRunPreview = {
  professional_name: string
  phones: string[]
  sms_body: string
  ticket_number: number
  building_name: string
}

export async function buildInboxForwardDryRunPreview(
  supabase: SupabaseClient,
  params: { ticketId: string; professionalId: string; clientId: string; note?: string | null }
): Promise<{ ok: true; preview: InboxForwardDryRunPreview } | { ok: false; error: string }> {
  const { ticketId, professionalId, clientId, note } = params

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select(`
      id,
      ticket_number,
      description,
      reporter_phone,
      reporter_name,
      project_id,
      projects (name)
    `)
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .single()

  if (ticketError || !ticket) {
    return { ok: false, error: 'תקלה לא נמצאה' }
  }

  const { data: professional, error: proError } = await supabase
    .from('professionals')
    .select('id, full_name, phone, extra_phones, trade, is_active')
    .eq('id', professionalId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .single()

  if (proError || !professional) {
    return { ok: false, error: 'איש מקצוע לא נמצא' }
  }

  if (!(professional as { is_active?: boolean }).is_active) {
    return { ok: false, error: 'איש המקצוע אינו פעיל' }
  }

  const phones = collectWorkerPhones(professional as WorkerPhoneSource)
  if (phones.length === 0) {
    return { ok: false, error: 'לאיש המקצוע אין מספר טלפון במערכת' }
  }

  const project = Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects
  const buildingName = (project as { name?: string } | null)?.name?.trim() || 'ללא שם בניין'
  const ticketNumber = ticket.ticket_number as number
  const description = truncateForSms((ticket.description as string | null) || 'ללא תיאור', 200)
  const [enrichedReporter] = await attachSavedResidentNames(supabase, clientId, [
    {
      reporter_phone: ticket.reporter_phone as string | null,
      reporter_name: ticket.reporter_name as string | null,
      project_id: ticket.project_id as string | null,
    },
  ])
  const reporterLabel =
    formatReporterNameAndPhone(enrichedReporter?.reporter_name, enrichedReporter?.reporter_phone) ||
    'לא ידוע'
  const proName = (professional as { full_name: string }).full_name
  const trade = (professional as { trade?: string | null }).trade?.trim()
  const noteTrim = note?.trim()

  let smsBody = `הועברה אליכם תקלה #${ticketNumber} ב${buildingName}. ${description}. מדווח: ${reporterLabel}.`
  if (trade) smsBody += ` תחום: ${trade}.`
  if (noteTrim) smsBody += ` הערה: ${truncateForSms(noteTrim, 120)}.`

  return {
    ok: true,
    preview: {
      professional_name: proName,
      phones,
      sms_body: smsBody,
      ticket_number: ticketNumber,
      building_name: buildingName,
    },
  }
}