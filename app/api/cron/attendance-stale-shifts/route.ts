import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getLogger } from '@/lib/logging'

const STALE_HOURS = 12

/** Mark open shifts older than 12h as missing_checkout. */
export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const cutoff = new Date(Date.now() - STALE_HOURS * 3_600_000).toISOString()

    const { data: stale, error } = await admin
      .from('worker_attendance')
      .select('id, client_id, worker_id, started_at')
      .eq('status', 'open')
      .lt('started_at', cutoff)

    if (error) {
      logger.error('CRON', 'attendance-stale-shifts query failed', new Error(error.message))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let updated = 0
    for (const row of stale ?? []) {
      const { error: upErr } = await admin
        .from('worker_attendance')
        .update({
          status: 'missing_checkout',
          updated_at: new Date().toISOString(),
        })
        .eq('id', (row as { id: string }).id)
        .eq('status', 'open')

      if (!upErr) updated++
    }

    logger.info('CRON', 'attendance-stale-shifts done', { found: stale?.length ?? 0, updated })
    return NextResponse.json({ ok: true, found: stale?.length ?? 0, updated })
  } catch (e) {
    logger.error('CRON', 'attendance-stale-shifts failed', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
