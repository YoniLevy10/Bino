import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { getOfficeAttendanceScanUrl, getWorkerAttendanceScanUrl } from '@/lib/public-app-url'

function buildOnboardingMessageHe(scanUrl: string, mode: 'nfc_tag' | 'office_station'): string {
  const intro =
    mode === 'nfc_tag'
      ? 'שלום,\nתיקוף שעות במערכת במקור — סריקת מדבקת NFC או QR בכניסה/בפרויקט.\n'
      : 'שלום,\nמתחילים תיקוף שעות במערכת במקור (QR ביניים עד תגי NFC).\n'
  const steps =
    mode === 'nfc_tag'
      ? '1. פתחו את הקישור האישי שלכם מהמנהל (פעם אחת, עם אינטרנט).\n2. בכל כניסה או יציאה ממשמרת בפרויקט — הצמידו את הטלפון למדבקת NFC (או סרקו QR).\n'
      : '1. סרקו את קוד ה-QR בכניסה למשרד.\n2. בחרו את שמכם ולחצו כניסה/יציאה.\n'
  return `${intro}${steps}\nקישור לסריקה:\n${scanUrl}`
}

/** QR onboarding link for interim clock-in until NFC tags are delivered. */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const clientId = auth.ctx.clientId

  const { data: tagRow } = await admin
    .from('worker_nfc_tags')
    .select('tag_code, tag_type, label')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('tag_type', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (tagRow?.tag_code) {
    const scanUrl = getWorkerAttendanceScanUrl(tagRow.tag_code as string)
    return NextResponse.json({
      scan_url: scanUrl,
      mode: 'nfc_tag',
      tag_code: tagRow.tag_code,
      tag_label: (tagRow as { label?: string | null }).label ?? null,
      onboarding_message_he: buildOnboardingMessageHe(scanUrl, 'nfc_tag'),
    })
  }

  const { data: clientRow, error: clientErr } = await admin
    .from('clients')
    .select('office_attendance_station_token')
    .eq('id', clientId)
    .maybeSingle()

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }

  let stationToken = (clientRow as { office_attendance_station_token?: string | null })
    .office_attendance_station_token
  if (!stationToken) {
    stationToken = crypto.randomUUID()
    await admin.from('clients').update({ office_attendance_station_token: stationToken }).eq('id', clientId)
  }

  const scanUrl = getOfficeAttendanceScanUrl(stationToken)
  return NextResponse.json({
    scan_url: scanUrl,
    mode: 'office_station',
    tag_code: null,
    tag_label: null,
    onboarding_message_he: buildOnboardingMessageHe(scanUrl, 'office_station'),
  })
}
