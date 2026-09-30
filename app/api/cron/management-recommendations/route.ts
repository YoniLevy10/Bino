import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getLogger } from '@/lib/logging'
import { runClientDetectors } from '@/lib/recommendations/run-client-detectors'

/** In-app recommendations scan — does NOT send SMS/WhatsApp. */
const MAX_CLIENTS_PER_RUN = 40

export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const { data: clients, error } = await admin
      .from('clients')
      .select('id')
      .order('id')
      .limit(MAX_CLIENTS_PER_RUN)

    if (error) {
      logger.error('CRON', 'management-recommendations clients query failed', new Error(error.message))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let scanned = 0
    let upserted = 0
    let cleared = 0

    for (const row of clients || []) {
      const clientId = row.id as string
      const result = await runClientDetectors(admin, clientId)
      scanned += 1
      upserted += result.upserted
      cleared += result.cleared
    }

    const stats = { ok: true, scanned, upserted, cleared, outbound_messages: 0 }
    logger.info('CRON', 'management-recommendations done', stats)
    return NextResponse.json(stats)
  } catch (e) {
    logger.error(
      'CRON',
      'management-recommendations fatal',
      e instanceof Error ? e : new Error(String(e))
    )
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
