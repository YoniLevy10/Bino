import { type SupabaseClient } from '@supabase/supabase-js'

const RECURRING_THRESHOLD = 3
const RECURRING_WINDOW_DAYS = 30

export async function checkAndFlagRecurringIssue(params: {
  supabase: SupabaseClient
  ticketId: string
  clientId: string
  projectId: string
  projectName: string
  reporterPhone: string
  ticketNumber: number | string
  clientManagerPhone: string | null
  smsSenderName: string | null
}): Promise<void> {
  const { supabase, ticketId, clientId, projectId, reporterPhone } = params

  const since = new Date(Date.now() - RECURRING_WINDOW_DAYS * 86_400_000).toISOString()

  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('project_id', projectId)
    .eq('reporter_phone', reporterPhone)
    .is('deleted_at', null)
    .gte('created_at', since)

  if (error || count == null || count < RECURRING_THRESHOLD) return

  await supabase.from('tickets').update({ is_recurring: true }).eq('id', ticketId)
}
