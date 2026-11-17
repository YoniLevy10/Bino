/**
 * Share helpers for sending building links into the building's WhatsApp group.
 * Manual share only (picker / open invite) — never Meta cold blast.
 */

import { getClientPublicOrigin } from '@/lib/public-origin'
import { residentDecisionInvitePath } from '@/lib/building-governance/roles'
import { openWhatsAppUrl } from '@/lib/sales-leads/phone'

const CHAT_WHATSAPP_HOST = 'chat.whatsapp.com'

/**
 * Accepts chat.whatsapp.com invite links (with or without https://).
 * Returns a normalized https URL or null.
 */
export function normalizeWhatsAppGroupInviteUrl(
  raw: string | null | undefined
): string | null {
  const trimmed = (raw || '').trim()
  if (!trimmed) return null

  let candidate = trimmed
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, '')}`
  }

  try {
    const u = new URL(candidate)
    const host = u.hostname.toLowerCase()
    if (host !== CHAT_WHATSAPP_HOST && host !== `www.${CHAT_WHATSAPP_HOST}`) {
      return null
    }
    // Require a non-empty invite path segment
    const code = u.pathname.replace(/^\/+|\/+$/g, '')
    if (!code || code.includes('/')) return null
    return `https://${CHAT_WHATSAPP_HOST}/${code}`
  } catch {
    return null
  }
}

/** Prefill-only WhatsApp share URL (manager picks the building group). */
export function buildWhatsAppTextShareUrl(message: string): string {
  const text = message.trim()
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
}

export function absoluteBuildingDecisionInviteUrl(opts: {
  projectId: string
  decisionId: string
  baseUrl?: string
}): string {
  const path = residentDecisionInvitePath(opts.projectId, {
    decisionId: opts.decisionId,
  })
  const base = (opts.baseUrl || getClientPublicOrigin()).replace(/\/$/, '')
  return `${base}${path}`
}

export function buildBuildingDecisionShareMessage(opts: {
  projectName: string
  decisionTitle: string
  inviteUrl: string
}): string {
  const building = opts.projectName.trim() || 'הבניין'
  const title = opts.decisionTitle.trim() || 'החלטה'
  const url = opts.inviteUrl.trim()
  return [
    `שלום, החלטה לאישור דיירים ב-${building}:`,
    title,
    '',
    'לצפייה והצבעה באזור האישי:',
    url,
  ].join('\n')
}

/**
 * Open WhatsApp with a prefilled share message (group picker).
 * Returns false if the environment cannot open links.
 */
export function openWhatsAppShareMessage(message: string): boolean {
  const href = buildWhatsAppTextShareUrl(message)
  return openWhatsAppUrl(href)
}

/** Open the stored group invite (join / open group in WhatsApp). */
export function openWhatsAppGroupInvite(inviteUrl: string): boolean {
  const normalized = normalizeWhatsAppGroupInviteUrl(inviteUrl)
  if (!normalized) return false
  return openWhatsAppUrl(normalized)
}
