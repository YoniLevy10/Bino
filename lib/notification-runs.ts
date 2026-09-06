import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationRunStatus = 'queued' | 'running' | 'completed' | 'failed'

export type NotificationRunSnapshot = {
  id: string
  kind: 'sms_campaign' | 'wa_broadcast'
  status: NotificationRunStatus
  recipients_total: number
  sent: number
  failed: number
  skipped_no_phone?: number
  error_message?: string | null
  finished_at?: string | null
  created_at?: string
}

export async function getSmsCampaignRun(
  admin: SupabaseClient,
  clientId: string,
  runId: string
): Promise<NotificationRunSnapshot | null> {
  const { data, error } = await admin
    .from('sms_campaign_runs')
    .select(
      'id, status, recipients_total, sent, failed, skipped_no_phone, error_message, finished_at, created_at'
    )
    .eq('id', runId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error || !data) return null
  const row = data as {
    id: string
    status?: string | null
    recipients_total: number
    sent: number
    failed: number
    skipped_no_phone: number
    error_message?: string | null
    finished_at?: string | null
    created_at?: string
  }
  return {
    id: row.id,
    kind: 'sms_campaign',
    status: (row.status as NotificationRunStatus) || 'completed',
    recipients_total: row.recipients_total,
    sent: row.sent,
    failed: row.failed,
    skipped_no_phone: row.skipped_no_phone,
    error_message: row.error_message,
    finished_at: row.finished_at,
    created_at: row.created_at,
  }
}

export async function getWaBroadcastRun(
  admin: SupabaseClient,
  clientId: string,
  runId: string
): Promise<NotificationRunSnapshot | null> {
  const { data, error } = await admin
    .from('wa_broadcast_runs')
    .select('id, status, recipients_total, sent, failed, error_message, finished_at, created_at')
    .eq('id', runId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error || !data) return null
  const row = data as {
    id: string
    status?: string | null
    recipients_total: number
    sent: number
    failed: number
    error_message?: string | null
    finished_at?: string | null
    created_at?: string
  }
  return {
    id: row.id,
    kind: 'wa_broadcast',
    status: (row.status as NotificationRunStatus) || 'completed',
    recipients_total: row.recipients_total,
    sent: row.sent,
    failed: row.failed,
    error_message: row.error_message,
    finished_at: row.finished_at,
    created_at: row.created_at,
  }
}
