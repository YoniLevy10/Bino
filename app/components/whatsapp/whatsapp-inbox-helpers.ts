import { formatWhatsAppInboxDisplayLabel } from '@/lib/whatsapp/whatsapp-inbox-display'
import { formatPhoneLocalIl } from '@/lib/sales-leads/phone'

export type WhatsAppInboxConversation = {
  id: string
  phone: string
  last_message_at: string
  last_message_preview: string | null
  residents?: { full_name?: string; apartment_number?: string | null } | { full_name?: string; apartment_number?: string | null }[] | null
}

export type WhatsAppInboxMessage = {
  id: string
  direction: 'in' | 'out'
  body: string | null
  message_type?: string | null
  interactive_payload?: Record<string, unknown> | null
  created_at: string
  ticket_id: string | null
}

const WA_AVATAR_COLORS = ['#00a884', '#53bdeb', '#7f66ff', '#e67e22', '#25d366', '#128c7e']

export function residentLabel(c: WhatsAppInboxConversation): string {
  const r = Array.isArray(c.residents) ? c.residents[0] : c.residents
  return formatWhatsAppInboxDisplayLabel(c.phone, r)
}

export function waInitials(label: string): string {
  const parts = label.replace(/[0-9+]/g, ' ').trim().split(/\s+/).filter((part) => part.length > 0)
  if (parts.length === 0) return 'ש'
  if (parts.length === 1) return parts[0].slice(0, 1)
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`
}

export function waAvatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return WA_AVATAR_COLORS[hash % WA_AVATAR_COLORS.length]
}

export function waClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

export function waListTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return waClock(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'אתמול'
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

export function waDayLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return 'היום'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'אתמול'
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

export function displayPhone(phone: string): string {
  return formatPhoneLocalIl(phone) ?? phone
}

export function formatInboxMessageBody(m: WhatsAppInboxMessage): string {
  const text = m.body?.trim()
  if (text) return text
  switch (m.message_type) {
    case 'image':
      return 'תמונה'
    case 'video':
      return 'וידאו'
    case 'audio':
      return 'הודעה קולית'
    case 'document':
      return 'מסמך'
    case 'interactive':
      return 'הודעה אינטראקטיבית'
    case 'template':
      return 'תבנית Meta'
    case 'reaction':
      return 'תגובה'
    case 'sticker':
      return 'מדבקה'
    case 'location':
      return 'מיקום'
    case 'unsupported':
      return 'הודעה לא נתמכת'
    default:
      return '—'
  }
}
