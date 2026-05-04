import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'

const RETENTION_DAYS = 30

/**
 * Deletes processed_webhooks rows older than RETENTION_DAYS to prevent unbounded table growth.
 * Without this, every WhatsApp message creates a permanent row — causing table bloat over months.
 */
export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ts = new Date().toISOString()
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  try {
    const admin = getSupabaseAdmin()

    const { error, count } = await admin
      .from('processed_webhooks')
      .delete({ count: 'exact' })
      .lt('processed_at', cutoff)

    if (error) {
      logger.error('CRON', 'cleanup-webhooks failed', new Error(error.message))
      void admin.from('system_logs').insert({
        level: 'error',
        source: 'cron.cleanup-webhooks',
        message: 'delete_failed',
        payload: { ts, detail: error.message },
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const deleted = count ?? 0
    console.log(`✅ cleanup-webhooks: deleted ${deleted} rows older than ${RETENTION_DAYS} days`)

    void admin.from('system_logs').insert({
      level: 'info',
      source: 'cron.cleanup-webhooks',
      message: 'cleanup_complete',
      payload: { ts, deleted, cutoff },
    })

    return NextResponse.json({ ok: true, deleted, cutoff })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error('CRON', 'cleanup-webhooks exception', e instanceof Error ? e : new Error(msg))
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
