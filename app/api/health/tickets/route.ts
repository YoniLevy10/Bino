import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { runTicketMediaHealthProbe } from '@/lib/ticket-media-health'

/**
 * Ticket + media subsystem health.
 * Open in browser: /api/health/tickets
 */
export async function GET() {
  try {
    const admin = getSupabaseAdmin()
    const report = await runTicketMediaHealthProbe(admin)
    const httpStatus = report.status === 'error' ? 503 : report.status === 'degraded' ? 200 : 200

    return NextResponse.json(
      {
        ...report,
        summary_he:
          report.status === 'ok'
            ? 'מערכת התקלות והמדיה תקינה'
            : report.status === 'degraded'
              ? 'מערכת התקלות פועלת עם אזהרות'
              : 'מערכת התקלות/מדיה — שגיאה קריטית',
        health_page: '/health',
      },
      { status: httpStatus }
    )
  } catch (e) {
    return NextResponse.json(
      {
        status: 'error',
        ts: new Date().toISOString(),
        summary_he: 'בדיקת בריאות נכשלה',
        issues: [e instanceof Error ? e.message : 'שגיאה לא ידועה'],
        checks: [],
        metrics: {
          unresolved_media_errors_24h: 0,
          unresolved_ticket_create_errors_24h: 0,
          stuck_whatsapp_media_sessions: 0,
          whatsapp_clients_ok: 0,
          whatsapp_clients_total: 0,
        },
      },
      { status: 503 }
    )
  }
}
