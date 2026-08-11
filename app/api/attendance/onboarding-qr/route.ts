import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { getWorkerAttendanceScanUrl } from '@/lib/public-app-url'

function buildOnboardingMessageHe(scanUrl: string): string {
  return (
    'שלום,\n' +
    'תיקוף שעות במערכת במקור — סריקת מדבקת NFC או QR בכניסה/בפרויקט.\n' +
    '1. פתחו את הקישור האישי שלכם מהמנהל (פעם אחת, עם אינטרנט).\n' +
    '2. בכל כניסה או יציאה ממשמרת — הצמידו את הטלפון למדבקת NFC (או סרקו QR).\n\n' +
    `קישור לדוגמה:\n${scanUrl}`
  )
}

/** NFC onboarding link — office QR interim path removed. */
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

  if (!tagRow?.tag_code) {
    return NextResponse.json(
      {
        error: 'אין תגי NFC פעילים. פנו לתמיכת במקור ליצירת מדבקות.',
        mode: 'nfc_required',
      },
      { status: 404 }
    )
  }

  const scanUrl = getWorkerAttendanceScanUrl(tagRow.tag_code as string)
  return NextResponse.json({
    scan_url: scanUrl,
    mode: 'nfc_tag',
    tag_code: tagRow.tag_code,
    tag_label: (tagRow as { label?: string | null }).label ?? null,
    onboarding_message_he: buildOnboardingMessageHe(scanUrl),
  })
}
