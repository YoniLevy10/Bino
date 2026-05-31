import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { sendWorkerPortalLinkBodySchema } from '@/lib/api-body-schemas'
import { sendWorkerSMSAll } from '@/lib/sms-send'
import { collectWorkerPhones } from '@/lib/worker-phones'

export async function POST(req: Request) {
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'workers-test-sms')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף לא תקין' }, { status: 400 })
    }

    const validated = sendWorkerPortalLinkBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const { worker_id } = validated.data

    const { data: worker, error: workerError } = await admin
      .from('workers')
      .select('id, full_name, phone, extra_phones, is_active')
      .eq('id', worker_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (workerError || !worker) {
      return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 })
    }

    const phones = collectWorkerPhones(worker as { phone?: string | null; extra_phones?: string[] | null })
    if (phones.length === 0) {
      return NextResponse.json({ error: 'לעובד אין מספר טלפון במערכת' }, { status: 400 })
    }

    const { data: clientRow } = await admin
      .from('clients')
      .select('sms_sender_name')
      .eq('id', clientId)
      .maybeSingle()

    const smsSenderName =
      (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null

    const name = (worker.full_name as string)?.trim() || 'עובד'
    const smsMessage = `שלום ${name}, זו הודעת בדיקה מ-Bamakor. אם קיבלת אותה - SMS תקין.`

    const batch = await sendWorkerSMSAll(phones, smsMessage, smsSenderName, clientId)
    if (batch.sent === 0) {
      return NextResponse.json(
        { error: 'שליחת SMS נכשלה — בדקו מספרי טלפון והגדרות 019SMS' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      sent: batch.sent,
      total: batch.total,
      phones: batch.phones,
      partial: !batch.ok,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
