import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { workerAttendanceSyncBodySchema } from '@/lib/api-body-schemas'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { processAttendanceSyncEvent, resolveTagForClient } from '@/lib/attendance-sync-server'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { notifyManagerAttendanceReview } from '@/lib/attendance-manager-notify'
import type { AttendanceSyncEventResult } from '@/lib/attendance-types'

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const rl = await checkIpPostRouteLimit(admin, clientIp(req), 'worker-attendance-sync')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
    }

    const parsed = workerAttendanceSyncBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(parsed.data.access_token)
    if (!worker) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const addonCheck = await requireClientPaidAddon(admin, worker.client_id, PAID_ADDON_KEYS.worker_stamp)
    if (!addonCheck.ok) return addonCheck.response

    const serverReceivedAt = new Date()
    const results: AttendanceSyncEventResult[] = []

    for (const ev of parsed.data.events) {
      const { tag, rejectReason } = await resolveTagForClient(admin, worker.client_id, ev.tag_code)
      if (!tag) {
        results.push({
          client_action_id: ev.client_action_id,
          status: 'rejected',
          message: rejectReason ?? 'unknown_tag',
        })
        continue
      }

      const result = await processAttendanceSyncEvent(
        {
          admin,
          clientId: worker.client_id,
          workerId: worker.id,
          serverReceivedAt,
        },
        ev,
        tag
      )
      results.push(result)
    }

    const newPending = results.filter((r) => r.status === 'pending_review').length
    if (newPending > 0) {
      const { count } = await admin
        .from('worker_attendance_events')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', worker.client_id)
        .eq('sync_status', 'pending_review')
      await notifyManagerAttendanceReview(admin, worker.client_id, count ?? newPending)
    }

    return NextResponse.json({ success: true, results })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
