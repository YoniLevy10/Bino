import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendManagerSMS } from '@/lib/sms-send'
import { getLogger } from '@/lib/logging'
import { normalizePhone019 } from '@/lib/sms-019-core'
import {
  WEEKLY_DIGEST_PILOT_CLIENT_ID,
  buildWeeklyDigestStats,
  formatWeeklyOpsDigestSms,
  israelWeekStartIso,
  weeklyDigestOpsPhones,
  type DigestOpenTicket,
  type WeeklyDigestStats,
} from '@/lib/weekly-ops-digest'

export const dynamic = 'force-dynamic'

const OPEN_TICKET_CAP = 200

type OpenTicketRow = {
  ticket_number: number | null
  created_at: string
  opened_at: string | null
  description: string | null
  project_id: string | null
  assigned_worker_id: string | null
}

type Admin = ReturnType<typeof getSupabaseAdmin>

function liveTickets(admin: Admin, clientId: string) {
  return admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .or('is_merged.is.null,is_merged.eq.false')
}

async function countTickets(
  admin: Admin,
  clientId: string,
  apply: (query: ReturnType<typeof liveTickets>) => ReturnType<typeof liveTickets>
): Promise<number> {
  const { count, error } = await apply(liveTickets(admin, clientId))
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function loadWeeklyStats(
  admin: Admin,
  clientId: string
): Promise<{ stats: WeeklyDigestStats; smsSenderName: string | null; managerPhone: string | null } | null> {
  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id, name, manager_phone, sms_sender_name')
    .eq('id', clientId)
    .maybeSingle()

  if (clientErr || !client) return null

  const since = israelWeekStartIso()
  const [opened, closed, recurringOpened] = await Promise.all([
    countTickets(admin, clientId, (q) => q.gte('opened_at', since)),
    countTickets(admin, clientId, (q) => q.gte('closed_at', since)),
    countTickets(admin, clientId, (q) => q.gte('opened_at', since).eq('is_recurring', true)),
  ])

  const { data: openData, error: openErr, count: openCount } = await admin
    .from('tickets')
    .select('ticket_number, created_at, opened_at, description, project_id, assigned_worker_id', {
      count: 'exact',
    })
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .or('is_merged.is.null,is_merged.eq.false')
    .order('created_at', { ascending: true })
    .limit(OPEN_TICKET_CAP)

  if (openErr) throw new Error(openErr.message)
  const openRows = (openData ?? []) as OpenTicketRow[]
  if ((openCount ?? openRows.length) > openRows.length) {
    throw new Error(`weekly digest open tickets truncated: ${openRows.length} of ${openCount}`)
  }

  const projectIds = [...new Set(openRows.map((t) => t.project_id).filter(Boolean))] as string[]
  const projectById = new Map<string, { name: string; slaHours: number | null }>()
  if (projectIds.length > 0) {
    const { data: projects, error: projectsErr } = await admin
      .from('projects')
      .select('id, name, sla_hours')
      .in('id', projectIds)
    if (projectsErr) throw new Error(projectsErr.message)
    for (const p of projects ?? []) {
      projectById.set(p.id as string, {
        name: (p.name as string) || '',
        slaHours: typeof p.sla_hours === 'number' ? p.sla_hours : null,
      })
    }
  }

  const openTickets: DigestOpenTicket[] = openRows.map((row) => {
    const project = row.project_id ? projectById.get(row.project_id) : undefined
    return {
      ticketNumber: row.ticket_number ?? '',
      building: project?.name || '',
      description: row.description || '',
      startedAt: row.opened_at || row.created_at,
      slaHours: project?.slaHours ?? null,
      assigned: Boolean(row.assigned_worker_id),
    }
  })

  const stats = buildWeeklyDigestStats({
    clientName: (client.name as string) || '',
    opened,
    closed,
    recurringOpened,
    openTickets,
  })

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
