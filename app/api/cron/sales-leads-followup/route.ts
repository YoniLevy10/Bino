import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { countDueFollowUps } from '@/lib/sales-leads/service'
import { sendManagerSMS } from '@/lib/sms-send'
import { getPublicAppUrl } from '@/lib/public-app-url'

export const dynamic = 'force-dynamic'

/** Daily reminder to Yoni only — never messages sales leads. */
const OPS_PHONE = process.env.BINO_SALES_OPS_PHONE?.trim() || '972548102688'

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const dueToday = await countDueFollowUps(admin)
    if (dueToday <= 0) {
      return NextResponse.json({ ok: true, dueToday: 0, notified: false })
    }

    const body =
      `מכירות בינו\n` +
      `לידים למעקב היום: ${dueToday}\n` +
      (appUrl ? `מסך לידים: ${appUrl}/superadmin` : 'מסך לידים: /superadmin')

    await sendManagerSMS(OPS_PHONE, body, null, null)

    return NextResponse.json({ ok: true, dueToday, notified: true })
  } catch (error) {
    console.error('[cron.sales-leads-followup]', error)
    return NextResponse.json({ error: 'Follow-up reminder failed' }, { status: 500 })
  }
}
