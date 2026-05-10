import { type SupabaseClient } from '@supabase/supabase-js'
import { sendManagerSMS } from '@/lib/sms-send'

const RECURRING_THRESHOLD = 3
const RECURRING_WINDOW_DAYS = 30

/**
 * After a ticket is created, check if the same reporter has opened
 * RECURRING_THRESHOLD+ tickets in the same project in the last RECURRING_WINDOW_DAYS days.
 * If so, flags the ticket as is_recurring and sends an alert to the manager.
 */
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
  const {
    supabase, ticketId, clientId, projectId, projectName,
    reporterPhone, ticketNumber, clientManagerPhone, smsSenderName,
  } = params

  const since = new Date(Date.now() - RECURRING_WINDOW_DAYS * 86_400_000).toISOString()

  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('project_id', projectId)
    .eq('reporter_phone', reporterPhone)
    .is('deleted_at', null)
    .gte('created_at', since)

  if (error || count == null) return
  if (count < RECURRING_THRESHOLD) return

  // Flag the ticket
  await supabase.from('tickets').update({ is_recurring: true }).eq('id', ticketId)

  if (!clientManagerPhone) return

  const msg =
    `⚠️ בעיה חוזרת — פרויקט ${projectName}\n` +
    `אותו דייר (${reporterPhone}) פתח ${count} תקלות ב-${RECURRING_WINDOW_DAYS} ימים אחרונים.\n` +
    `תקלה אחרונה: #${ticketNumber}\n` +
    `מומלץ לבדוק אם יש בעיה מבנית.`

  try {
    await sendManagerSMS(clientManagerPhone, msg, smsSenderName, clientId)
  } catch { /* silent */ }
}
