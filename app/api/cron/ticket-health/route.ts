import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import { runTicketMediaHealthProbe } from '@/lib/ticket-media-health'
import { notifyPlatformOps } from '@/lib/platform-ops-alert'

/**
 * Cron: ticket + media health probe. Emails platform ops on degraded/error.
 * Vercel cron — every 6 hours.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logger = getLogger()

  try {
    const admin = getSupabaseAdmin()
    const report = await runTicketMediaHealthProbe(admin)

    await admin.from('system_logs').insert({
      level: report.status === 'ok' ? 'info' : 'error',
      source: 'cron.ticket-health',
      message: `ticket_media_${report.status}`,
      payload: {
        ts: report.ts,
        issues: report.issues,
        metrics: report.metrics,
      },
    })

    if (report.status !== 'ok') {
      logger.warn('CRON', 'ticket-health not ok', { status: report.status, issues: report.issues })
      await notifyPlatformOps({
        kind: report.status === 'error' ? 'operational_error' : 'media_attach_failure',
        title:
          report.status === 'error'
            ? 'בדיקת בריאות: מערכת תקלות/מדיה — שגיאה'
            : 'בדיקת בריאות: מערכת תקלות/מדיה — אזהרה',
        message: report.issues.join('\n') || 'בדיקת ticket-health נכשלה',
        details: {
          status: report.status,
          metrics: report.metrics,
        },
      })
    }

    return NextResponse.json(report, { status: report.status === 'error' ? 503 : 200 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error('CRON', 'ticket-health exception', e instanceof Error ? e : new Error(msg))
    await notifyPlatformOps({
      kind: 'operational_error',
      title: 'בדיקת בריאות תקלות — חריגה',
      message: msg,
      details: { source: 'cron.ticket-health' },
    })
    return NextResponse.json({ status: 'error', detail: msg }, { status: 503 })
  }
}
