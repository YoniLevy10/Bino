import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { sendManagerSMS, getManagerPhoneFromEnv } from '@/lib/sms-send'

export async function POST() {
  const requestId = `test-sms-${Date.now()}`
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const { clientId } = auth.ctx

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'test-sms')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const { data: client } = await admin
      .from('clients')
      .select('manager_phone, sms_sender_name')
      .eq('id', clientId)
      .maybeSingle()

    const destination =
      (client as { manager_phone?: string | null } | null)?.manager_phone?.trim() ||
      getManagerPhoneFromEnv()

    if (!destination) {
      return NextResponse.json(
        { error: 'לא הוגדר מספר טלפון מנהל — הגדר בהגדרות → מספר טלפון מנהל', requestId },
        { status: 400 }
      )
    }

    const senderName = (client as { sms_sender_name?: string | null } | null)?.sms_sender_name || null
    const ok = await sendManagerSMS(destination, 'הודעת בדיקה מ-Bino - SMS עובד בהצלחה', senderName, clientId)

    if (!ok) {
      return NextResponse.json(
        { error: 'שליחת SMS נכשלה — בדוק את SMS_019_USERNAME ו-SMS_019_PASSWORD ב-Vercel', requestId },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, destination, requestId })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה פנימית', requestId },
      { status: 500 }
    )
  }
}
