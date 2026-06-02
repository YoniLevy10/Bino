import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { getPublicAppUrl } from '@/lib/public-app-url'

const DEDUP_WINDOW_MS = 30 * 60 * 1000

export type PlatformOpsAlertInput = {
  kind: 'sms_failure' | 'whatsapp_failure' | 'operational_error'
  title: string
  message: string
  clientId?: string | null
  clientName?: string | null
  details?: Record<string, unknown>
}

function resolveOpsEmail(): string | null {
  const explicit = (process.env.PLATFORM_OPS_EMAIL || '').trim()
  if (explicit) return explicit
  const vapid = (process.env.VAPID_SUBJECT || '').trim()
  const mailto = vapid.match(/^mailto:(.+)$/i)
  if (mailto?.[1]) return mailto[1].trim()
  return null
}

function buildDedupKey(input: PlatformOpsAlertInput): string {
  const clientPart = input.clientId || 'global'
  const detailHint =
    typeof input.details?.channel === 'string'
      ? input.details.channel
      : typeof input.details?.to === 'string'
        ? input.details.to
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
  const from = (process.env.RESEND_FROM_EMAIL || 'Bamakor Ops <onboarding@resend.dev>').trim()

  if (!to) {
    console.warn('[platform-ops-alert] PLATFORM_OPS_EMAIL not set — skipping email')
    return false
  }
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
 * Deduped ~30 min per incident key. Requires PLATFORM_OPS_EMAIL + RESEND_API_KEY.
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

  const subject = `[Bamakor] ${input.title}`.slice(0, 200)
  const sent = await sendOpsEmail(subject, lines.join('\n'))
  if (sent) await markAlertSent(dedupKey)
}
