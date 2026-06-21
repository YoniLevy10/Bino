import {
  WHATSAPP_INBOX_META_TEMPLATES,
  getInboxMetaTemplateById,
  type InboxMetaTemplate,
} from '@/lib/whatsapp-inbox-meta-templates'

/** Utility templates allowed for project-wide broadcast (per-resident templates excluded). */
export const WA_BROADCAST_TEMPLATE_IDS = ['ticket_closed'] as const

export type WaBroadcastTemplateId = (typeof WA_BROADCAST_TEMPLATE_IDS)[number]

export function listWaBroadcastTemplates(): InboxMetaTemplate[] {
  return WHATSAPP_INBOX_META_TEMPLATES.filter((t) =>
    (WA_BROADCAST_TEMPLATE_IDS as readonly string[]).includes(t.id)
  )
}

export function resolveWaBroadcastTemplate(templateId: string): InboxMetaTemplate | undefined {
  if (!(WA_BROADCAST_TEMPLATE_IDS as readonly string[]).includes(templateId)) {
    return undefined
  }
  return getInboxMetaTemplateById(templateId)
}

export function resolveWaBroadcastTemplateByMetaName(metaName: string): InboxMetaTemplate | undefined {
  const lower = metaName.trim().toLowerCase()
  return listWaBroadcastTemplates().find((t) => t.resolveMetaName().toLowerCase() === lower)
}
