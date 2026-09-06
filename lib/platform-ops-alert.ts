import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { getPublicAppUrl } from '@/lib/public-app-url'

const DEDUP_WINDOW_MS = 30 * 60 * 1000

/** Default inbox when PLATFORM_OPS_EMAIL and VAPID_SUBJECT mailto are unset. */
const DEFAULT_PLATFORM_OPS_EMAIL = 'levyyoni5@gmail.com'

export type PlatformOpsAlertKind =
  | 'sms_failure'
  | 'whatsapp_failure'
  | 'ticket_create_failure'
  | 'media_attach_failure'
  | 'operational_error'

export type PlatformOpsAlertInput = {
  kind: PlatformOpsAlertKind
  title: string
  message: string
  clientId?: string | null
  clientName?: string | null
  details?: Record<string, unknown>
}

function resolveOpsEmail(): string {
  const explicit = (process.env.PLATFORM_OPS_EMAIL || '').trim()
  if (explicit) return explicit
  const vapid = (process.env.VAPID_SUBJECT || '').trim()
  const mailto = vapid.match(/^mailto:(.+)$/i)
  if (mailto?.[1]) return mailto[1].trim()
  return DEFAULT_PLATFORM_OPS_EMAIL
}

function buildDedupKey(input: PlatformOpsAlertInput): string {
  const clientPart = input.clientId || 'global'
  const detailHint =
    typeof input.details?.reason === 'string'
      ? input.details.reason
      : typeof input.details?.context === 'string'
        ? input.details.context
        : typeof input.details?.channel === 'string'
          ? input.details.channel
          : typeof input.details?.to === 'string'
            ? input.details.to
            : typeof input.details?.ticketId === 'string'
              ? input.details.ticketId
              : ''
  return `${input.kind}:${clientPart}:${input.title}:${detailHint}`.slice(0, 200)
}

async function shouldSendAlert(dedupKey: string): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin()
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
    const { data } = await admin
      .from('platform_ops_alert_sent')
      .select('sent_at')
      .eq('dedup_key', dedupKey)
      .gte('sent_at', cutoff)
      .maybeSingle()
    return !data
  } catch {
    return true
  }
}

async function markAlertSent(dedupKey: string): Promise<void> {
  try {
    const admin = getSupabaseAdmin()
    await admin.from('platform_ops_alert_sent').upsert(
      { dedup_key: dedupKey, sent_at: new Date().toISOString() },
      { onConflict: 'dedup_key' }
    )
  } catch (e) {
    console.error('[platform-ops-alert] dedup upsert failed:', e instanceof Error ? e.message : String(e))
  }
}

async function sendOpsEmail(subject: string, text: string): Promise<boolean> {
  const to = resolveOpsEmail()
  const apiKey = (process.env.RESEND_API_KEY || '').trim()
  const from = (process.env.RESEND_FROM_EMAIL || 'Bino <office@bamakor.com>').trim()

  if (!apiKey) {
    console.warn('[platform-ops-alert] RESEND_API_KEY not set — skipping email')
    return false
  }

  const res = await fetchWithTimeout(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: subject.slice(0, 200),
        text: text.slice(0, 12000),
      }),
    },
    15_000
  )

  if (!res?.ok) {
    const body = res ? await res.text().catch(() => '') : 'timeout'
    console.error('[platform-ops-alert] Resend failed:', res?.status, body.slice(0, 500))
    return false
  }
  return true
}

/**
 * Email platform operator on operational failures (not shown in tenant UI).
 * Deduped ~30 min per incident key. Uses PLATFORM_OPS_EMAIL (or default / VAPID_SUBJECT mailto). Requires RESEND_API_KEY.
 */
export async function notifyPlatformOps(input: PlatformOpsAlertInput): Promise<void> {
  const dedupKey = buildDedupKey(input)
  if (!(await shouldSendAlert(dedupKey))) return

  const appUrl = getPublicAppUrl()
  const lines = [
    input.title,
    '',
    input.message,
    '',
    input.clientName ? `לקוח: ${input.clientName}` : input.clientId ? `client_id: ${input.clientId}` : '',
    appUrl ? `מערכת: ${appUrl}` : '',
    '',
    input.details && Object.keys(input.details).length > 0
      ? `פרטים: ${JSON.stringify(input.details).slice(0, 2000)}`
      : '',
  ].filter(Boolean)

  const subject = `[Bino] ${input.title}`.slice(0, 200)
  const sent = await sendOpsEmail(subject, lines.join('\n'))
  if (sent) await markAlertSent(dedupKey)
}