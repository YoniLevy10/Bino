'use client'

import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, PriorityDot, StatusBadge, theme } from '../ui'
import { isTicketInTreatment, ticketStatusLabelHe } from '@/lib/ticket-status'
import { formatRelativeTimeHe } from '@/lib/relative-time-he'
import { googleMapsHref, telHref, wazeHref, whatsAppHref } from '@/lib/contact-links'
import { toast } from '@/lib/error-handler'

export type WorkerTicketCardTicket = {
  id: string
  ticket_number: number
  description: string | null
  status: string
  created_at: string
  priority?: string | null
  reporter_phone?: string | null
  reporter_name?: string | null
  building_number?: string | null
  project_name?: string | null
  project_address?: string | null
}

export type WorkerAttachment = {
  id: string
  file_name: string
  public_url: string | null
  mime_type: string | null
  attachment_type?: string | null
}

type WorkerTicketCardProps = {
  ticket: WorkerTicketCardTicket
  colors?: typeof theme.colors
  isActive: boolean
  onActivate: () => void
  busyKey: string | null
  expandedChat: boolean
  translation: string | null
  translating: boolean
  onTranslate: () => void
  onInProgress: () => void
  onCloseRequest: () => void
  onToggleChat: () => void
  chatSlot?: ReactNode
  attachments?: WorkerAttachment[]
  attachmentsLoading?: boolean
  onUploadPhoto?: (file: File) => void
  uploadingPhoto?: boolean
}

function locationLine(ticket: WorkerTicketCardTicket): string {
  const parts: string[] = []
  if (ticket.project_name) parts.push(ticket.project_name)
  if (ticket.building_number) parts.push(`בניין ${ticket.building_number}`)
  return parts.join(' · ')
}

export function WorkerTicketCard({
  ticket,
  colors = theme.colors,
  isActive,
  onActivate,
  busyKey,
  expandedChat,
  translation,
  translating,
  onTranslate,
  onInProgress,
  onCloseRequest,
  onToggleChat,
  chatSlot,
  attachments = [],
  attachmentsLoading = false,
  onUploadPhoto,
  uploadingPhoto = false,
}: WorkerTicketCardProps) {
  const [descOpen, setDescOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const desc = ticket.description?.trim() || '—'
  const longDesc = desc.length > 120
  const priority = ticket.priority || 'MEDIUM'
  const relativeWhen = formatRelativeTimeHe(ticket.created_at)
  const loc = locationLine(ticket)
  const canMarkInProgress = !isTicketInTreatment(ticket.status)
  const tel = telHref(ticket.reporter_phone)
  const wa = whatsAppHref(
    ticket.reporter_phone,
    `שלום, לגבי תקלה #${ticket.ticket_number} ב${ticket.project_name || 'פרויקט'}`
  )
  const waze = wazeHref(ticket.project_address)
  const maps = googleMapsHref(ticket.project_address)
  const imageAttachments = attachments.filter((a) => a.mime_type?.startsWith('image/') && a.public_url)

  async function copyTicketNumber() {
    try {
      await navigator.clipboard.writeText(String(ticket.ticket_number))
      toast.success('מספר תקלה הועתק')
    } catch {
      toast.error('העתקה נכשלה')
    }
  }

  if (!isActive) {
    return (
      <button type="button" style={styles.compact(colors, priority)} onClick={onActivate}>
        <div style={styles.compactRow}>
          <PriorityDot priority={priority} />
          <span style={styles.num(colors)}>#{ticket.ticket_number}</span>
          <StatusBadge status={ticket.status} size="sm" />
          <span style={styles.when(colors)}>{relativeWhen}</span>
        </div>
        {loc ? <div style={styles.compactLoc(colors)}>{loc}</div> : null}
        <p style={styles.compactDesc(colors)}>{desc}</p>
      </button>
    )
  }

  return (
    <article style={styles.card(colors, priority)}>
      <div style={styles.topRow}>
        <PriorityDot priority={priority} />
        <button type="button" style={styles.numBtn(colors)} onClick={() => void copyTicketNumber()}>
          #{ticket.ticket_number}
        </button>
        <StatusBadge status={ticket.status} size="sm" />
        <span style={styles.when(colors)} title={new Date(ticket.created_at).toLocaleString('he-IL')}>
          {relativeWhen}
        </span>
      </div>

      {loc ? <div style={styles.building(colors)}>{loc}</div> : null}
      {ticket.reporter_name ? (
        <div style={styles.reporter(colors)}>דיווח: {ticket.reporter_name}</div>
      ) : null}

      <p style={descOpen ? styles.descOpen(colors) : styles.descClamp(colors)}>{desc}</p>

      <div style={styles.toolRow}>
        {longDesc ? (
          <button type="button" style={styles.linkBtn(colors)} onClick={() => setDescOpen((v) => !v)}>
            {descOpen ? 'פחות' : 'עוד'}
          </button>
        ) : null}
        {desc !== '—' ? (
          <button type="button" style={styles.linkBtn(colors)} onClick={onTranslate} disabled={translating}>
            {translating ? 'מתרגם…' : 'תרגום'}
          </button>
        ) : null}
        <span style={styles.statusHint(colors)}>{ticketStatusLabelHe(ticket.status, { feminine: true })}</span>
      </div>

      {translation ? (
        <div style={styles.translationBox(colors)}>
          <div style={styles.translationLabel(colors)}>תרגום</div>
          <p style={styles.translationText(colors)}>{translation}</p>
        </div>
      ) : null}

      {(tel || wa || waze || maps) && (
        <div style={styles.contactRow}>
          {tel ? (
            <a href={tel} style={styles.contactLink(colors)}>
              התקשר
            </a>
          ) : null}
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" style={styles.contactLink(colors)}>
              WhatsApp
            </a>
          ) : null}
          {waze ? (
            <a href={waze} target="_blank" rel="noopener noreferrer" style={styles.contactLink(colors)}>
              Waze
            </a>
          ) : null}
          {maps ? (
            <a href={maps} target="_blank" rel="noopener noreferrer" style={styles.contactLink(colors)}>
              מפות
            </a>
          ) : null}
        </div>
      )}

      <div style={styles.attachSection(colors)}>
        <div style={styles.attachHead(colors)}>תמונות</div>
        {attachmentsLoading ? (
          <p style={styles.attachMuted(colors)}>טוען…</p>
        ) : imageAttachments.length === 0 ? (
          <p style={styles.attachMuted(colors)}>אין תמונות</p>
        ) : (
          <div style={styles.gallery}>
            {imageAttachments.map((a) => (
              <a
                key={a.id}
                href={a.public_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.thumbWrap}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.public_url || ''} alt={a.file_name} style={styles.thumb} />
              </a>
            ))}
          </div>
        )}
        {onUploadPhoto ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onUploadPhoto(file)
                e.target.value = ''
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={uploadingPhoto}
              onClick={() => fileInputRef.current?.click()}
            >
              צילום אחרי תיקון
            </Button>
          </>
        ) : null}
      </div>

      <div style={styles.actions}>
        {canMarkInProgress ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={!!busyKey}
            loading={busyKey === `${ticket.id}:IN_PROGRESS`}
            onClick={onInProgress}
          >
            בטיפול
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          disabled={!!busyKey}
          loading={busyKey === `${ticket.id}:CLOSED`}
          onClick={onCloseRequest}
        >
          סיום
        </Button>
        <Button variant="secondary" size="sm" onClick={onToggleChat}>
          {expandedChat ? 'סגור צ׳אט' : 'צ׳אט'}
        </Button>
      </div>

      {expandedChat && chatSlot ? <div style={styles.chatWrap(colors)}>{chatSlot}</div> : null}
    </article>
  )
}

const priorityBorder: Record<string, string> = {
  URGENT: theme.colors.error,
  HIGH: theme.colors.warning,
  MEDIUM: theme.colors.primary,
  LOW: theme.colors.textMuted,
}

const styles = {
  compact: (c: typeof theme.colors, priority: string): CSSProperties => ({
    display: 'block',
    width: '100%',
    textAlign: 'right',
    padding: '10px 12px',
    borderRadius: '12px',
    border: `1px solid ${c.border}`,
    borderInlineStart: `3px solid ${priorityBorder[priority] || c.border}`,
    background: c.surface,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  }),
  compactRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '4px',
  } as CSSProperties,
  compactLoc: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    fontWeight: 600,
    color: c.textMuted,
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  compactDesc: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '12px',
    margin: 0,
    color: c.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right',
  }),
  card: (c: typeof theme.colors, priority: string): CSSProperties => ({
    padding: '10px 12px',
    borderRadius: '12px',
    border: `1px solid ${c.border}`,
    borderInlineStart: `3px solid ${priorityBorder[priority] || c.border}`,
    background: c.surface,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  }),
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '6px',
  } as CSSProperties,
  num: (c: typeof theme.colors): CSSProperties => ({
    fontWeight: 700,
    color: c.primary,
    fontSize: '14px',
  }),
  numBtn: (c: typeof theme.colors): CSSProperties => ({
    fontWeight: 700,
    color: c.primary,
    fontSize: '14px',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  }),
  when: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    color: c.textMuted,
    marginInlineStart: 'auto',
  }),
  building: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    fontWeight: 600,
    color: c.textMuted,
    marginBottom: '4px',
  }),
  reporter: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    color: c.textSecondary,
    marginBottom: '4px',
  }),
  descClamp: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '13px',
    margin: '0 0 6px',
    lineHeight: 1.35,
    color: c.textPrimary,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }),
  descOpen: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '13px',
    margin: '0 0 6px',
    lineHeight: 1.35,
    color: c.textPrimary,
    whiteSpace: 'pre-wrap',
  }),
  toolRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  } as CSSProperties,
  linkBtn: (c: typeof theme.colors): CSSProperties => ({
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: '12px',
    fontWeight: 600,
    color: c.primary,
    cursor: 'pointer',
  }),
  statusHint: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    color: c.textMuted,
    marginInlineStart: 'auto',
  }),
  translationBox: (c: typeof theme.colors): CSSProperties => ({
    marginBottom: '8px',
    padding: '8px 10px',
    borderRadius: '8px',
    background: c.muted,
    maxHeight: '100px',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  }),
  translationLabel: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '10px',
    fontWeight: 700,
    color: c.textMuted,
    marginBottom: '4px',
  }),
  translationText: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '12px',
    margin: 0,
    lineHeight: 1.4,
    color: c.textPrimary,
  }),
  contactRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  } as CSSProperties,
  contactLink: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '12px',
    fontWeight: 700,
    color: c.primary,
    textDecoration: 'none',
    padding: '4px 10px',
    borderRadius: '8px',
    background: c.primaryMuted,
  }),
  attachSection: (c: typeof theme.colors): CSSProperties => ({
    marginBottom: '8px',
    padding: '8px 0',
    borderTop: `1px solid ${c.border}`,
  }),
  attachHead: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    fontWeight: 700,
    color: c.textMuted,
    marginBottom: '6px',
  }),
  attachMuted: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '12px',
    color: c.textMuted,
    margin: '0 0 6px',
  }),
  gallery: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  } as CSSProperties,
  thumbWrap: {
    display: 'block',
    width: '72px',
    height: '72px',
    borderRadius: '8px',
    overflow: 'hidden',
    flexShrink: 0,
  } as CSSProperties,
  thumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  } as CSSProperties,
  actions: { display: 'flex', gap: '6px', flexWrap: 'wrap' } as CSSProperties,
  chatWrap: (c: typeof theme.colors): CSSProperties => ({
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: `1px solid ${c.border}`,
  }),
}
