import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { autoCloseStaleOpenShiftsForWorker } from '@/lib/attendance-auto-close'

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

/** Online setup: profile, NFC tags, projects, open shift for IndexedDB cache. */
export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const rl = await checkIpPostRouteLimit(admin, clientIp(req), 'worker-attendance-bootstrap')
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

    await autoCloseStaleOpenShiftsForWorker(admin, worker.client_id, worker.id)

    const [tagsRes, projectsRes, shiftRes] = await Promise.all([
      admin
        .from('worker_nfc_tags')
        .select('id, client_id, project_id, tag_code, tag_type, label, is_active')
        .eq('client_id', worker.client_id)
        .eq('is_active', true)
        .order('tag_code'),
      admin
        .from('projects')
        .select('id, name, project_code')
        .eq('client_id', worker.client_id)
        .eq('is_active', true)
        .order('name'),
      admin
        .from('worker_attendance')
        .select('id, started_at, status')
        .eq('client_id', worker.client_id)
        .eq('worker_id', worker.id)
        .eq('status', 'open')
        .maybeSingle(),
    ])

    if (tagsRes.error) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const openShift = shiftRes.data
    return NextResponse.json({
      worker_id: worker.id,
      client_id: worker.client_id,
      full_name: worker.full_name,
      tags: tagsRes.data ?? [],
      projects: projectsRes.data ?? [],
      attendance_state: {
        has_open_shift: !!openShift,
        open_shift_id: openShift?.id ?? null,
        open_shift_started_at: openShift?.started_at ?? null,
      },
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
