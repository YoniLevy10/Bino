import type { SupabaseClient } from '@supabase/supabase-js'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'
import { sendServiceSmsAndWhatsApp } from '@/lib/building-governance/service-notify'
import { getResidentPortalJoinUrl } from '@/lib/public-origin'
import { getPublicAppUrl } from '@/lib/public-app-url'
import { logAudit } from '@/lib/audit'
import { getLogger } from '@/lib/logging'

const BATCH_LIMIT = 40
const BETWEEN_MS = 350

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function joinUrlForProject(projectId: string): string {
  // Prefer env/public origin for SMS (server-side); getResidentPortalJoinUrl uses client origin when window exists.
  const base = getPublicAppUrl()
  if (base) return `${base}/resident/join/${encodeURIComponent(projectId)}`
  return getResidentPortalJoinUrl(projectId)
}

async function invitedRecently(
  admin: SupabaseClient,
  clientId: string,
  residentId: string
): Promise<boolean> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await admin
    .from('audit_log')
    .select('id')
    .eq('client_id', clientId)
    .eq('action', 'resident_join_invite_sent')
    .eq('entity_type', 'resident')
    .eq('entity_id', residentId)
    .gte('created_at', since)
    .limit(1)
  return Boolean(data?.length)
}

/**
 * Batch-send resident portal join invites (service SMS / in-session WA).
 * Skips residents without phone and those invited in the last 7 days.
 */
export async function sendResidentJoinInvitesBatch(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    projectName?: string | null
    userId?: string | null
    /** Cap batch size (default 40). */
    limit?: number
    /** Only these resident ids (optional). */
    residentIds?: string[]
  }
): Promise<{
  attempted: number
  sent: number
  skipped: number
  errors: number
}> {
  if (!isBuildingGovernanceAutoNotifyEnabled()) {
    return { attempted: 0, sent: 0, skipped: 0, errors: 0 }
  }

  const limit = Math.min(BATCH_LIMIT, Math.max(1, opts.limit ?? BATCH_LIMIT))

  // Ensure portal enabled for this project
  await admin
    .from('projects')
    .update({ resident_portal_enabled: true })
    .eq('id', opts.projectId)
    .eq('client_id', opts.clientId)

  let query = admin
    .from('residents')
    .select('id, full_name, phone')
    .eq('client_id', opts.clientId)
    .eq('project_id', opts.projectId)
    .not('phone', 'is', null)
    .order('full_name', { ascending: true })
    .limit(limit)

  if (opts.residentIds?.length) {
    query = query.in('id', opts.residentIds.slice(0, limit))
  }

  const { data: residents, error } = await query
  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'resident invite list failed',
      new Error(error.message),
      { clientId: opts.clientId }
    )
    return { attempted: 0, sent: 0, skipped: 0, errors: 1 }
  }

  const building = opts.projectName?.trim() || 'הבניין'
  const joinUrl = joinUrlForProject(opts.projectId)
  let attempted = 0
  let sent = 0
  let skipped = 0
  let errors = 0

  for (const row of residents ?? []) {
    const r = row as { id: string; full_name: string; phone: string | null }
    const phone = (r.phone || '').trim()
    if (!phone) {
      skipped++
      continue
    }
    if (await invitedRecently(admin, opts.clientId, r.id)) {
      skipped++
      continue
    }

    attempted++
    const name = (r.full_name || '').trim() || 'דייר/ת'
    const message = `Bino: שלום ${name}, קישור לאזור האישי של הדיירים ב-${building}: ${joinUrl} כניסה עם מספר הטלפון הרשום.`

    try {
      const result = await sendServiceSmsAndWhatsApp(admin, {
        clientId: opts.clientId,
        phone,
        message,
        channel: 'resident_join_invite',
      })
      if (result.sms || result.whatsapp) {
        sent++
        await logAudit({
          clientId: opts.clientId,
          userId: opts.userId ?? null,
          action: 'resident_join_invite_sent',
          entityType: 'resident',
          entityId: r.id,
          newValues: {
            project_id: opts.projectId,
            sms: result.sms,
            whatsapp: result.whatsapp,
          },
        })
      } else {
        skipped++
      }
    } catch {
      errors++
    }

    await sleep(BETWEEN_MS)
  }

  return { attempted, sent, skipped, errors }
}
