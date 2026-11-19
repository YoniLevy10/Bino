import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'
import { notifyTenantManagerService } from '@/lib/building-governance/service-notify'
import { getPublicAppUrl } from '@/lib/shared/public-app-url'
import { logAudit } from '@/lib/audit'
import { getLogger } from '@/lib/shared/logging'

async function notifyManagersPush(
  admin: SupabaseClient,
  clientId: string,
  title: string,
  body: string,
  tag: string
): Promise<boolean> {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
    if (!publicKey || !privateKey) return false

    const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@bino.app'
    webpush.setVapidDetails(subject, publicKey, privateKey)

    const { data: rows } = await admin
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('client_id', clientId)
      .limit(50)

    if (!rows?.length) return false

    const payload = JSON.stringify({
      title,
      body,
      url: '/projects',
      tag,
    })

    await Promise.allSettled(
      rows.map(async (row) => {
        const sub = (row as { subscription?: unknown }).subscription
        if (!sub || typeof sub !== 'object') return
        try {
          await webpush.sendNotification(sub as webpush.PushSubscription, payload, {
            TTL: 86400,
          })
        } catch {
          /* expired etc. */
        }
      })
    )
    return true
  } catch (e) {
    getLogger().warn('BUILDING_GOVERNANCE', 'document publish push failed', {
      err: e instanceof Error ? e.message : String(e),
    })
    return false
  }
}

/**
 * On publish to resident portal: notify building managers (push + SMS/WA).
 * Resident fan-out is intentionally manager-first to avoid marketing spam;
 * join-invite flow covers resident outreach separately.
 */
export async function notifyDocumentPublished(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId?: string | null
    documentId: string
    fileName: string
    userId?: string | null
  }
): Promise<{ push: boolean; managerNotify: boolean }> {
  if (!isBuildingGovernanceAutoNotifyEnabled()) {
    return { push: false, managerNotify: false }
  }

  let building = 'הבניין'
  if (opts.projectId) {
    const { data: project } = await admin
      .from('projects')
      .select('name')
      .eq('id', opts.projectId)
      .eq('client_id', opts.clientId)
      .maybeSingle()
    building = (project as { name?: string } | null)?.name?.trim() || building
  }

  const fileLabel = (opts.fileName || 'מסמך').trim().slice(0, 80)
  const appUrl = getPublicAppUrl()
  const link = appUrl ? `${appUrl}/projects` : ''
  const smsBody = `Bino: פורסם מסמך חדש לדיירים ב-${building}: ${fileLabel}.${link ? ` ${link}` : ''}`

  const [push, manager] = await Promise.all([
    notifyManagersPush(
      admin,
      opts.clientId,
      'מסמך חדש בפורטל דיירים',
      `${building}: ${fileLabel}`,
      `portal-doc-${opts.documentId}`
    ),
    notifyTenantManagerService(admin, {
      clientId: opts.clientId,
      message: smsBody,
      channel: 'portal_document_published',
    }),
  ])

  const managerNotify = Boolean(manager.sms || manager.whatsapp)
  if (push || managerNotify) {
    await logAudit({
      clientId: opts.clientId,
      userId: opts.userId ?? null,
      action: 'portal_document_publish_notified',
      entityType: 'project_document',
      entityId: opts.documentId,
      newValues: {
        push,
        sms: manager.sms,
        whatsapp: manager.whatsapp,
        project_id: opts.projectId ?? null,
      },
    })
  }

  return { push, managerNotify }
}
