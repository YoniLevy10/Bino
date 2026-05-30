import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { sendWorkerPortalLinkBodySchema } from '@/lib/api-body-schemas'
import { sendWorkerSMS } from '@/lib/sms-send'
import { getWorkerPortalUrl } from '@/lib/public-app-url'

export async function POST(req: Request) {
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'workers-send-portal-link')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const rawBody = await req.json()
    const validated = sendWorkerPortalLinkBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const { worker_id } = validated.data

    const { data: worker, error: workerError } = await admin
      .from('workers')
      .select('id, full_name, phone, access_token, is_active')
      .eq('id', worker_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (workerError || !worker) {
      return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 })
    }

    if (!worker.is_active) {
      return NextResponse.json({ error: 'העובד אינו פעיל' }, { status: 400 })
    }

    const phone = worker.phone?.trim()
    if (!phone) {
      return NextResponse.json({ error: 'לעובד אין מספר טלפון במערכת' }, { status: 400 })
    }

    const token = worker.access_token?.trim()
    if (!token) {
      return NextResponse.json({ error: 'אין קישור אישי לעובד — פנו לתמיכה' }, { status: 400 })
    }

    const { data: clientRow } = await admin
      .from('clients')
      .select('name, sms_sender_name')
      .eq('id', clientId)
      .maybeSingle()

    const clientName = (clientRow as { name?: string | null } | null)?.name?.trim() || 'Bamakor'
    const smsSenderName =
      (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null

    const portalUrl = getWorkerPortalUrl(token)
    const smsMessage = `שלום ${worker.full_name}, האזור האישי שלך לתקלות: ${portalUrl} — ${clientName}`

    const sent = await sendWorkerSMS(phone, smsMessage, smsSenderName, clientId)
    if (!sent) {
      return NextResponse.json({ error: 'שליחת SMS נכשלה — בדקו מספר טלפון והגדרות 019SMS' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
