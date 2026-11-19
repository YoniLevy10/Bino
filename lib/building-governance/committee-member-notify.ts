import type { SupabaseClient } from '@supabase/supabase-js'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'
import { sendServiceSmsAndWhatsApp } from '@/lib/building-governance/service-notify'
import { COMMITTEE_ROLE_LABELS_HE, type CommitteeRole } from '@/lib/building-governance/roles'
import { getPublicAppUrl } from '@/lib/shared/public-app-url'
import { logAudit } from '@/lib/audit'

/** Optional welcome / signer invite when a committee member is added. */
export async function maybeInviteCommitteeMember(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    projectName?: string | null
    memberId: string
    fullName: string
    phone: string | null | undefined
    role: string
    /** Explicit opt-in from UI, or auto when role is signer. */
    sendInvite?: boolean
    userId?: string | null
  }
): Promise<{ sent: boolean; sms: boolean; whatsapp: boolean }> {
  if (!isBuildingGovernanceAutoNotifyEnabled()) {
    return { sent: false, sms: false, whatsapp: false }
  }

  const should =
    opts.sendInvite === true ||
    (opts.sendInvite !== false && (opts.role === 'signer' || opts.role === 'chair'))
  if (!should) return { sent: false, sms: false, whatsapp: false }

  const phone = opts.phone?.trim()
  if (!phone) return { sent: false, sms: false, whatsapp: false }

  const roleLabel =
    COMMITTEE_ROLE_LABELS_HE[opts.role as CommitteeRole] || opts.role || 'חבר ועד'
  const building = opts.projectName?.trim() || 'הבניין'
  const appUrl = getPublicAppUrl()
  const link = appUrl ? `${appUrl}/projects` : ''

  const message =
    opts.role === 'signer' || opts.role === 'chair'
      ? `Bino: שלום ${opts.fullName.trim()}, נוספתם כ${roleLabel} ב-${building}. כשתפתח החלטה תקבלו קישור לחתימה.${link ? ` ${link}` : ''}`
      : `Bino: שלום ${opts.fullName.trim()}, נוספתם לוועד הבית ב-${building} (${roleLabel}).${link ? ` ${link}` : ''}`

  const result = await sendServiceSmsAndWhatsApp(admin, {
    clientId: opts.clientId,
    phone,
    message,
    channel: 'building_committee_invite',
  })

  if (result.sms || result.whatsapp) {
    await logAudit({
      clientId: opts.clientId,
      userId: opts.userId ?? null,
      action: 'building_committee_invite_sent',
      entityType: 'building_committee_member',
      entityId: opts.memberId,
      newValues: {
        project_id: opts.projectId,
        role: opts.role,
        sms: result.sms,
        whatsapp: result.whatsapp,
      },
    })
  }

  return {
    sent: Boolean(result.sms || result.whatsapp),
    sms: result.sms,
    whatsapp: result.whatsapp,
  }
}
