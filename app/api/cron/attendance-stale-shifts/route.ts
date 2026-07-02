import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getLogger } from '@/lib/logging'
import { autoCloseAllStaleOpenShifts } from '@/lib/attendance-auto-close'
import { listWorkerStampEnabledClientIds } from '@/lib/worker-stamp-clients'

/** Auto-close open shifts older than 10h (no checkout) so workers can clock in again. */
export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const clientIds = await listWorkerStampEnabledClientIds(admin)
    const { found, closed } = await autoCloseAllStaleOpenShifts(admin, { clientIds })

    logger.info('CRON', 'attendance-stale-shifts done', { found, closed })
    return NextResponse.json({ ok: true, found, closed })
  } catch (e) {
    logger.error('CRON', 'attendance-stale-shifts failed', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
