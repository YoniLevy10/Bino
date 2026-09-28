import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { clientHasPaidAddon, PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'

function getRequestIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

const WORKER_OPEN_TICKETS_SELECT =
  'id, ticket_number, description, status, created_at, priority, reporter_phone, reporter_name, building_number, projects(name, address, address_en)'

/**
 * Single round-trip for field portal open: worker profile + open tickets + stamp flag.
 * Avoids sequential /api/worker-auth then /api/worker/tickets (and duplicate token resolve).
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getRequestIp(req)
    const admin = getSupabaseAdmin()
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-bootstrap')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const token = sanitizeId(req.nextUrl.searchParams.get('token'))
    if (!token) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const [ticketsResult, workerStampEnabled, clientRow] = await Promise.all([
      admin
        .from('tickets')
        .select(WORKER_OPEN_TICKETS_SELECT)
        .eq('client_id', worker.client_id)
        .eq('assigned_worker_id', worker.id)
        .is('deleted_at', null)
        .neq('status', 'CLOSED')
        .order('created_at', { ascending: false }),
      clientHasPaidAddon(admin, worker.client_id, PAID_ADDON_KEYS.worker_stamp),
      admin
        .from('clients')
        .select('name, logo_url')
        .eq('id', worker.client_id)
        .maybeSingle(),
    ])

    if (ticketsResult.error) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const client = clientRow.data as { name?: string | null; logo_url?: string | null } | null

    return NextResponse.json({
      worker_id: worker.id,
      client_id: worker.client_id,
      full_name: worker.full_name,
      client_name: client?.name?.trim() || null,
      logo_url: client?.logo_url?.trim() || null,
      worker_stamp_enabled: workerStampEnabled,
      can_mark_professional_escort: worker.can_mark_professional_escort === true,
      tickets: ticketsResult.data || [],
    })
  } catch {
    return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  }
}
