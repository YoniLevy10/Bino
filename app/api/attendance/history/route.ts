import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import type { AttendanceHistoryShift } from '@/lib/attendance-history'

function parseIsoParam(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

type RawShiftRow = {
  id: string
  worker_id: string
  started_at: string
  ended_at: string | null
  total_minutes: number | null
  status: string
  workers?: { full_name?: string; hourly_rate?: number | null } | { full_name?: string; hourly_rate?: number | null }[] | null
}

function formatShift(row: RawShiftRow): AttendanceHistoryShift {
  const w = row.workers
  const worker = Array.isArray(w) ? w[0] : w
  const rate = worker?.hourly_rate
  return {
    id: row.id,
    worker_id: row.worker_id,
    worker_name: worker?.full_name?.trim() || '—',
    hourly_rate: rate != null && Number.isFinite(Number(rate)) ? Number(rate) : null,
    started_at: row.started_at,
    ended_at: row.ended_at,
    total_minutes: row.total_minutes,
    status: row.status,
  }
}

/** Closed / archived shifts in date range for the attendance history tab. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'attendance-history-get')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const from = parseIsoParam(req.nextUrl.searchParams.get('from'))
  const to = parseIsoParam(req.nextUrl.searchParams.get('to'))
  if (!from || !to) {
    return NextResponse.json({ error: 'נדרש טווח תאריכים תקין' }, { status: 400 })
  }
  if (new Date(to) <= new Date(from)) {
    return NextResponse.json({ error: 'טווח תאריכים לא תקין' }, { status: 400 })
  }

  const workerId = req.nextUrl.searchParams.get('worker_id')

  try {
    const rows = await fetchAllRows<RawShiftRow>((fromIdx, toIdx) => {
      let q = admin
        .from('worker_attendance')
        .select(
          `
          id,
          worker_id,
          started_at,
          ended_at,
          total_minutes,
          status,
          workers ( full_name, hourly_rate )
        `
        )
        .eq('client_id', auth.ctx.clientId)
        .gte('started_at', from)
        .lt('started_at', to)
        .order('started_at', { ascending: false })
        .range(fromIdx, toIdx)

      if (workerId) q = q.eq('worker_id', workerId)

      return q
    })

    const shifts = rows.map(formatShift)
    return NextResponse.json({ shifts, total: shifts.length })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
