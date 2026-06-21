import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { sendWorkerAttendanceLinksBodySchema } from '@/lib/api-body-schemas'
import { sendWorkerSMSAll } from '@/lib/sms-send'
import { getWorkerPortalUrl } from '@/lib/public-app-url'
import { collectWorkerPhones } from '@/lib/worker-phones'

/** Send personal portal links to field workers (onboarding for NFC). */
export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'attendance-send-links')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const parsed = sendWorkerAttendanceLinksBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const clientId = auth.ctx.clientId
  const { worker_ids, send_all_active } = parsed.data

  if (!send_all_active && (!worker_ids || worker_ids.length === 0)) {
    return NextResponse.json({ error: 'נדרש send_all_active או worker_ids' }, { status: 400 })
  }

  let q = admin
    .from('workers')
    .select('id, full_name, phone, extra_phones, access_token, is_active')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .is('deleted_at', null)

  if (worker_ids?.length) q = q.in('id', worker_ids)

  const { data: workers, error } = await q
  if (error) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: clientRow } = await admin
    .from('clients')
    .select('name, sms_sender_name')
    .eq('id', clientId)
    .maybeSingle()

  const clientName = (clientRow as { name?: string } | null)?.name?.trim() || 'Bamakor'
  const smsSender =
    (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null

  let sentWorkers = 0
  let failedWorkers = 0
  let totalSms = 0

  for (const w of workers ?? []) {
    const row = w as {
      full_name: string
      access_token?: string | null
      phone?: string | null
      extra_phones?: string[] | null
    }
    const token = row.access_token?.trim()
    const phones = collectWorkerPhones(row)
    if (!token || phones.length === 0) {
      failedWorkers++
      continue
    }
    const portalUrl = getWorkerPortalUrl(token)
    const smsMessage =
      `שלום ${row.full_name},\n` +
      `1. פתחו את הקישור פעם אחת (Wi-Fi):\n${portalUrl}\n` +
      `2. בכל יום - הצמידו את הטלפון למדבקה בכניסה וביציאה.\n` +
      clientName

    const batch = await sendWorkerSMSAll(phones, smsMessage, smsSender, clientId)
    totalSms += batch.sent
    if (batch.sent > 0) sentWorkers++
    else failedWorkers++
  }

  return NextResponse.json({
    ok: sentWorkers > 0,
    workers_sent: sentWorkers,
    workers_failed: failedWorkers,
    sms_sent: totalSms,
    message: `נשלח ל-${sentWorkers} עובדים (${totalSms} SMS)`,
  })
}
