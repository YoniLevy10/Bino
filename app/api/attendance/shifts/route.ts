import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

/** Tenant: shift rows for hours report / Excel export. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'attendance-shifts-get')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const workerId = sp.get('worker_id')
  const limit = Math.min(2000, Math.max(1, Number(sp.get('limit') || 500)))

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
      start_source,
      end_source,
      workers ( full_name, hourly_rate )
    `
    )
    .eq('client_id', auth.ctx.clientId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (from) q = q.gte('started_at', from)
  if (to) q = q.lte('started_at', to)
  if (workerId) q = q.eq('worker_id', workerId)

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }

  return NextResponse.json({ shifts: data ?? [] })
}
