import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

/** Worker personal area — own shift history. */
export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const rl = await checkIpPostRouteLimit(admin, clientIp(req), 'worker-attendance-shifts')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
    }

    const token = sanitizeId(req.nextUrl.searchParams.get('token'))
    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const addonCheck = await requireClientPaidAddon(admin, worker.client_id, PAID_ADDON_KEYS.worker_stamp)
    if (!addonCheck.ok) return addonCheck.response

    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 40)))

    const { data, error } = await admin
      .from('worker_attendance')
      .select('id, started_at, ended_at, total_minutes, status')
      .eq('client_id', worker.client_id)
      .eq('worker_id', worker.id)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    return NextResponse.json({ shifts: data ?? [] })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
