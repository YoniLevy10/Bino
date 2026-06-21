import type { SupabaseClient } from '@supabase/supabase-js'
import { sendResendEmail } from '@/lib/email-resend'
import { sendManagerSMS } from '@/lib/sms-send'
import { getPublicAppUrl } from '@/lib/public-app-url'

function managerEmailFromPhone(phone: string | null | undefined): string | null {
  const p = (phone || '').trim()
  if (!p || !p.includes('@')) return null
  return p
}

/** Notify tenant manager about attendance items needing review. */
export async function notifyManagerAttendanceReview(
  admin: SupabaseClient,
  clientId: string,
  pendingCount: number
): Promise<void> {
  if (pendingCount <= 0) return

  const { data: client } = await admin
    .from('clients')
    .select('name, manager_phone, sms_sender_name')
    .eq('id', clientId)
    .maybeSingle()

  const name = (client as { name?: string } | null)?.name?.trim() || 'Bamakor'
  const managerPhone = (client as { manager_phone?: string | null } | null)?.manager_phone?.trim() || null
  const smsSender = (client as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null
  const appUrl = getPublicAppUrl()
  const link = appUrl ? `${appUrl}/attendance` : '/attendance'

  const smsBody = `${name}: יש ${pendingCount} החתמות שדורשות אישור במערכת. ${link}`
  if (managerPhone && !managerPhone.includes('@')) {
    try {
      await sendManagerSMS(managerPhone, smsBody, smsSender, clientId)
    } catch {
      /* logged in sms layer */
    }
  }

  const email = managerEmailFromPhone(managerPhone)
  if (email) {
    await sendResendEmail({
      to: email,
      subject: `${name} — ${pendingCount} החתמות ממתינות לאישור`,
      body: `שלום,\n\nיש ${pendingCount} רישומי נוכחות שדורשים בדיקה.\n\nכנסו למערכת: ${link}\n`,
    })
  }
}
