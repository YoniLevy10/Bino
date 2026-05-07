/**
 * Weekly preventive maintenance intelligence cron.
 * Analyzes ticket patterns per project and alerts managers about:
 * - Buildings with high ticket volume (>5 in 30 days)
 * - Repeat reporters (3+ tickets from same phone)
 * - Most common issue types (by keyword frequency in descriptions)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { sendManagerSMS } from '@/lib/sms-send'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp-send'
import { getLogger } from '@/lib/logging'

const WINDOW_DAYS = 30
const HIGH_VOLUME_THRESHOLD = 5
const REPEAT_REPORTER_THRESHOLD = 3

function since(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const windowStart = since(WINDOW_DAYS)

    // Fetch tickets in the window
    const { data: tickets, error } = await admin
      .from('tickets')
      .select('id, client_id, project_id, reporter_phone, description, created_at')
      .is('deleted_at', null)
      .gte('created_at', windowStart)

    if (error) {
      logger.error('CRON', 'preventive-maintenance tickets query failed', new Error(error.message))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!tickets?.length) {
      return NextResponse.json({ ok: true, message: 'No tickets in window', reportsSent: 0 })
    }

    // Group by client
    const byClient: Record<string, typeof tickets> = {}
    for (const t of tickets) {
      const cid = t.client_id as string
      if (!byClient[cid]) byClient[cid] = []
      byClient[cid].push(t)
    }

    let reportsSent = 0

    for (const [clientId, clientTickets] of Object.entries(byClient)) {
      const { data: clientRow } = await admin
        .from('clients')
        .select('manager_phone, whatsapp_phone_number_id, whatsapp_access_token, sms_sender_name')
        .eq('id', clientId)
        .maybeSingle()
      if (!clientRow) continue

      const managerPhone = (clientRow as { manager_phone?: string | null }).manager_phone?.trim()
      if (!managerPhone) continue

      // Group by project
      const byProject: Record<string, typeof tickets> = {}
      for (const t of clientTickets) {
        const pid = t.project_id as string
        if (!byProject[pid]) byProject[pid] = []
        byProject[pid].push(t)
      }

      const insights: string[] = []

      for (const [pid, projTickets] of Object.entries(byProject)) {
        const { data: proj } = await admin.from('projects').select('name').eq('id', pid).maybeSingle()
        const projName = (proj as { name?: string } | null)?.name ?? pid

        // High volume
        if (projTickets.length >= HIGH_VOLUME_THRESHOLD) {
          insights.push(`🏢 ${projName}: ${projTickets.length} תקלות ב-${WINDOW_DAYS} ימים`)
        }

        // Repeat reporters
        const phoneCounts: Record<string, number> = {}
        for (const t of projTickets) {
          const phone = (t.reporter_phone as string | null) ?? ''
          if (phone) phoneCounts[phone] = (phoneCounts[phone] ?? 0) + 1
        }
        for (const [phone, cnt] of Object.entries(phoneCounts)) {
          if (cnt >= REPEAT_REPORTER_THRESHOLD) {
            insights.push(`🔄 ${projName}: דייר ${phone} פתח ${cnt} תקלות — ייתכן בעיה מבנית`)
          }
        }

        // Top keyword
        const keywords: Record<string, number> = {}
        const STOP = new Set(['את', 'של', 'עם', 'על', 'לא', 'יש', 'אני', 'זה', 'כי', 'אבל', 'מה', 'הבניין', 'הדירה'])
        for (const t of projTickets) {
          const words = ((t.description as string | null) ?? '').split(/\s+/)
          for (const w of words) {
            const clean = w.replace(/[^א-תa-zA-Z]/g, '')
            if (clean.length >= 3 && !STOP.has(clean)) {
              keywords[clean] = (keywords[clean] ?? 0) + 1
            }
          }
        }
        const topWord = Object.entries(keywords).sort((a, b) => b[1] - a[1])[0]
        if (topWord && topWord[1] >= 3) {
          insights.push(`📋 ${projName}: המילה הנפוצה ביותר — "${topWord[0]}" (${topWord[1]}x)`)
        }
      }

      if (!insights.length) continue

      const report =
        `📊 דוח תחזוקה מונעת — ${WINDOW_DAYS} ימים אחרונים\n\n` +
        insights.join('\n') +
        `\n\nמומלץ לבדוק את הנ"ל לפני שיהפכו לבעיות גדולות.`

      const waCreds = (clientRow as { whatsapp_phone_number_id?: string | null; whatsapp_access_token?: string | null })
      const hasWA = waCreds.whatsapp_phone_number_id && waCreds.whatsapp_access_token

      let sent = false
      if (hasWA) {
        try {
          await sendWhatsAppTextMessage(
            managerPhone, report,
            { phoneNumberId: waCreds.whatsapp_phone_number_id!, accessToken: waCreds.whatsapp_access_token! },
            { clientId }
          )
          sent = true
        } catch { /* fall through */ }
      }

      if (!sent) {
        try {
          await sendManagerSMS(
            managerPhone, report,
            (clientRow as { sms_sender_name?: string | null }).sms_sender_name ?? null,
            clientId
          )
          sent = true
        } catch { /* silent */ }
      }

      if (sent) reportsSent++
    }

    logger.info('CRON', 'preventive-maintenance done', { reportsSent })
    return NextResponse.json({ ok: true, reportsSent })
  } catch (e) {
    logger.error('CRON', 'preventive-maintenance fatal', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
