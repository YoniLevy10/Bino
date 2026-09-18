import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendManagerSMS } from '@/lib/sms-send'
import { isOutboundMessagingBlocked } from '@/lib/shabbat-messaging-gate'
import { getLogger } from '@/lib/logging'
import { normalizePhone019 } from '@/lib/sms-019-core'
import {
  WEEKLY_DIGEST_PILOT_CLIENT_ID,
  formatWeeklyOpsDigestSms,
  weeklyDigestOpsPhones,
  type WeeklyDigestFocusTicket,
  type WeeklyDigestStats,
} from '@/lib/weekly-ops-digest'

export const dynamic = 'force-dynamic'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

type TicketRow = {
  id: string
  ticket_number: number | null
  status: string
  created_at: string
  closed_at: string | null
  sla_alerted: boolean | null
  is_recurring: boolean | null
  description: string | null
  project_id: string | null
}

async function loadWeeklyStats(
  admin: ReturnType<typeof getSupabaseAdmin>,
  clientId: string
): Promise<{ stats: WeeklyDigestStats; smsSenderName: string | null; managerPhone: string | null } | null> {
  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id, name, manager_phone, sms_sender_name')
    .eq('id', clientId)
    .maybeSingle()

  if (clientErr || !client) return null

  const since = new Date(Date.now() - WEEK_MS).toISOString()

  const { data: tickets, error: ticketsErr } = await admin
    .from('tickets')
    .select(
      'id, ticket_number, status, created_at, closed_at, sla_alerted, is_recurring, description, project_id'
    )
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .or(`created_at.gte.${since},closed_at.gte.${since},status.neq.CLOSED`)

  if (ticketsErr) throw new Error(ticketsErr.message)

  const rows = (tickets ?? []) as TicketRow[]
  const opened = rows.filter((t) => t.created_at >= since).length
  const closed = rows.filter((t) => t.closed_at && t.closed_at >= since).length
  const openRows = rows.filter((t) => t.status !== 'CLOSED')
  const openNow = openRows.length
  const openSlaRisk = openRows.filter((t) => t.sla_alerted === true).length
  const recurringOpened = rows.filter((t) => t.created_at >= since && t.is_recurring === true).length

  const projectIds = [...new Set(openRows.map((t) => t.project_id).filter(Boolean))] as string[]
  const projectNameById = new Map<string, string>()
  if (projectIds.length > 0) {
    const { data: projects } = await admin.from('projects').select('id, name').in('id', projectIds)
    for (const p of projects ?? []) {
      projectNameById.set(p.id as string, (p.name as string) || '')
    }
  }

  const focusRow =
    openRows.find((t) => t.sla_alerted === true) ||
    [...openRows].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ||
    null

  let focus: WeeklyDigestFocusTicket | null = null
  if (focusRow) {
    focus = {
      ticketNumber: focusRow.ticket_number ?? focusRow.id.slice(0, 8),
      building: focusRow.project_id ? projectNameById.get(focusRow.project_id) || '' : '',
      description: focusRow.description || '',
      slaAlerted: focusRow.sla_alerted === true,
    }
  }

  const stats: WeeklyDigestStats = {
    clientName: (client.name as string) || 'Bamakor',
    opened,
    closed,
    openNow,
    openSlaRisk,
    recurringOpened,
    focus,
  }

  return {
    stats,
    smsSenderName: (client.sms_sender_name as string | null) ?? null,
    managerPhone: (client.manager_phone as string | null) ?? null,
  }
}

function uniquePhones(...raw: Array<string | null | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    if (!r) continue
    const n = normalizePhone019(r)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

/**
 * Friday morning Israel (~08:00): weekly wrap SMS to Sarah (Bamakor manager)
 * and Yoni (ops). Query dryRun=1 to preview without sending.
 */
export async function GET(request: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'

  if (!dryRun && isOutboundMessagingBlocked()) {
    logger.info('CRON', 'weekly-ops-digest skipped — Shabbat')
    return NextResponse.json({ ok: true, skipped: 'shabbat', sent: 0 })
  }

  try {
    const admin = getSupabaseAdmin()
    const clientId = WEEKLY_DIGEST_PILOT_CLIENT_ID
    const loaded = await loadWeeklyStats(admin, clientId)
    if (!loaded) {
      return NextResponse.json({ error: 'Pilot client not found', clientId }, { status: 404 })
    }

    const body = formatWeeklyOpsDigestSms(loaded.stats)
    const phones = uniquePhones(loaded.managerPhone, ...weeklyDigestOpsPhones())

    if (phones.length === 0) {
      return NextResponse.json({ ok: false, error: 'No recipient phones', body, stats: loaded.stats }, { status: 400 })
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        clientId,
        phones,
        body,
        stats: loaded.stats,
      })
    }

    let sent = 0
    for (const phone of phones) {
      const ok = await sendManagerSMS(phone, body, loaded.smsSenderName, clientId)
      if (ok) sent++
    }

    logger.info('CRON', 'weekly-ops-digest done', { clientId, sent, total: phones.length })
    return NextResponse.json({
      ok: true,
      clientId,
      sent,
      total: phones.length,
      phones,
      body,
      stats: loaded.stats,
    })
  } catch (e) {
    logger.error('CRON', 'weekly-ops-digest failed', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'Weekly digest failed' }, { status: 500 })
  }
}
