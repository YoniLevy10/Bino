'use client'

import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, PriorityDot, StatusBadge, theme } from '../ui'
import { isTicketStatus, ticketStatusLabelHe, type TicketStatus } from '@/lib/ticket-status'
import { formatRelativeTimeHe } from '@/lib/relative-time-he'
import { googleMapsHref, telHref, wazeHref } from '@/lib/contact-links'
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
  onStatusChange: (status: TicketStatus) => void
  onToggleChat: () => void
  chatSlot?: ReactNode
  expandedWa?: boolean
  onToggleWa?: () => void
  waSlot?: ReactNode
  attachments?: WorkerAttachment[]
  attachmentsLoading?: boolean
  onUploadPhoto?: (file: File) => void
  uploadingPhoto?: boolean
  showAttendanceHint?: boolean
}

const QUICK_STATUSES: { value: TicketStatus; label: string; tone: 'primary' | 'muted' | 'success' }[] = [
  { value: 'IN_PROGRESS', label: 'התחלתי לטפל', tone: 'primary' },
  { value: 'WAITING_PARTS', label: 'ממתין לחלקים', tone: 'muted' },
  { value: 'CLOSED', label: 'סיימתי', tone: 'success' },
]

const MORE_STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'SITE_TOUR', label: 'סיור באתר' },
  { value: 'PROFESSIONAL_ESCORT', label: 'ליווי איש מקצוע' },
]

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
  onStatusChange,
  onToggleChat,
  chatSlot,
  expandedWa = false,
  onToggleWa,
  waSlot,
  attachments = [],
  attachmentsLoading = false,
  onUploadPhoto,
  uploadingPhoto = false,
  showAttendanceHint = false,
}: WorkerTicketCardProps) {
  const [descOpen, setDescOpen] = useState(false)
  const [moreStatusOpen, setMoreStatusOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const desc = ticket.description?.trim() || '—'
  const longDesc = desc.length > 120
  const priority = ticket.priority || 'MEDIUM'
  const relativeWhen = formatRelativeTimeHe(ticket.created_at)
  const loc = locationLine(ticket)
  const tel = telHref(ticket.reporter_phone)
  const waze = wazeHref(ticket.project_address)
  const maps = googleMapsHref(ticket.project_address)
  const mediaAttachments = attachments.filter(
    (a) => (a.mime_type?.startsWith('image/') || a.mime_type?.startsWith('video/')) && a.public_url
  )
  const statusBusy = !!busyKey?.startsWith(`${ticket.id}:`)
  const showMoreStatus =
    moreStatusOpen ||
    (isTicketStatus(ticket.status) && MORE_STATUSES.some((s) => s.value === ticket.status))

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
      <button type="button" style={styles.compact(colors, priority)} onClick={onActivate} aria-expanded={false}>
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
      <button
        type="button"
        style={styles.collapseHeader(colors)}
        onClick={onActivate}
        aria-expanded={true}
        aria-label="סגור תקלה"
      >
        <div style={styles.compactRow}>
          <PriorityDot priority={priority} />
          <span style={styles.num(colors)}>#{ticket.ticket_number}</span>
          <StatusBadge status={ticket.status} size="sm" />
          <span style={styles.when(colors)} title={new Date(ticket.created_at).toLocaleString('he-IL')}>
            {relativeWhen}
          </span>
          <span style={styles.collapseHint(colors)}>▲ סגור</span>
        </div>
        {loc ? <div style={styles.compactLoc(colors)}>{loc}</div> : null}
        {showAttendanceHint && loc ? (
          <div style={styles.attendanceHint(colors)}>ביקור בבניין זה נרשם בהחתמת NFC</div>
        ) : null}
      </button>

      <div style={styles.expandedBody}>
        {ticket.reporter_name ? (
          <div style={styles.reporter(colors)}>דיווח: {ticket.reporter_name}</div>
        ) : null}

        <p style={descOpen ? styles.descOpen(colors) : styles.descClamp(colors)}>{desc}</p>

        <div style={styles.toolRow}>
          {longDesc ? (
            <button type="button" style={styles.linkBtn(colors)} onClick={() => setDescOpen((v) => !v)}>
              {descOpen ? 'פחות' : 'קרא עוד'}
            </button>
          ) : null}
          {desc !== '—' ? (
            <button type="button" style={styles.linkBtn(colors)} onClick={onTranslate} disabled={translating}>
              {translating ? 'מתרגם…' : 'תרגום לעברית'}
            </button>
          ) : null}
        </div>

        {translation ? (
          <div style={styles.translationBox(colors)}>
            <div style={styles.translationLabel(colors)}>תרגום</div>
            <p style={styles.translationText(colors)}>{translation}</p>
          </div>
        ) : null}

        <div style={styles.section(colors)}>
          <div style={styles.sectionTitle(colors)}>מה הסטטוס?</div>
          <div style={styles.statusGrid}>
            {QUICK_STATUSES.map((opt) => {
              const active = ticket.status === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={statusBusy}
                  onClick={() => onStatusChange(opt.value)}
                  style={styles.statusBtn(colors, opt.tone, active)}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            style={styles.moreStatusToggle(colors)}
            onClick={() => setMoreStatusOpen((v) => !v)}
          >
            {showMoreStatus ? '▼ אפשרויות נוספות' : '▶ אפשרויות נוספות'}
          </button>
          {showMoreStatus ? (
            <div style={styles.moreStatusRow}>
              {MORE_STATUSES.map((opt) => {
                const active = ticket.status === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={statusBusy}
                    onClick={() => onStatusChange(opt.value)}
                    style={styles.moreStatusBtn(colors, active)}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          ) : null}
          <div style={styles.currentStatus(colors)}>
            עכשיו: {ticketStatusLabelHe(ticket.status, { feminine: true })}
          </div>
        </div>

        {(tel || waze || maps) && (
          <div style={styles.section(colors)}>
            <div style={styles.sectionTitle(colors)}>יצירת קשר וניווט</div>
            <div style={styles.contactRowBig}>
              {tel ? (
                <a href={tel} style={styles.contactBtn(colors, 'call')}>
                  <span style={styles.contactBtnIcon}>📞</span>
                  <span>התקשר לדייר</span>
                </a>
              ) : null}
              {waze ? (
                <a href={waze} target="_blank" rel="noopener noreferrer" style={styles.contactBtn(colors, 'nav')}>
                  <span style={styles.contactBtnIcon}>🗺️</span>
                  <span>ניווט Waze</span>
                </a>
              ) : null}
              {maps ? (
                <a href={maps} target="_blank" rel="noopener noreferrer" style={styles.contactBtn(colors, 'nav')}>
                  <span style={styles.contactBtnIcon}>📍</span>
                  <span>מפות</span>
                </a>
              ) : null}
            </div>
          </div>
        )}

        <div style={styles.section(colors)}>
          <div style={styles.sectionTitle(colors)}>שליחת הודעה</div>
          <div style={styles.messageActions}>
            {ticket.reporter_phone && onToggleWa ? (
              <button
                type="button"
                onClick={onToggleWa}
                style={styles.messageCard(colors, expandedWa, 'resident')}
              >
                <span style={styles.messageCardTitle(colors)}>הודעה לדייר</span>
                <span style={styles.messageCardHint(colors)}>ב-WhatsApp — הדייר יראה את ההודעה</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onToggleChat}
              style={styles.messageCard(colors, expandedChat, 'office')}
            >
              <span style={styles.messageCardTitle(colors)}>הודעה למשרד</span>
              <span style={styles.messageCardHint(colors)}>רק המנהל רואה — לא הדייר</span>
            </button>
          </div>
        </div>

        {expandedWa && waSlot ? <div style={styles.threadWrap(colors)}>{waSlot}</div> : null}
        {expandedChat && chatSlot ? <div style={styles.threadWrap(colors)}>{chatSlot}</div> : null}

        <div style={styles.attachSection(colors)}>
          <div style={styles.attachHead(colors)}>תמונות מהשטח</div>
          {attachmentsLoading ? (
            <p style={styles.attachMuted(colors)}>טוען…</p>
          ) : mediaAttachments.length === 0 ? (
            <p style={styles.attachMuted(colors)}>אין תמונות עדיין</p>
          ) : (
            <div style={styles.gallery}>
              {mediaAttachments.map((a) =>
                a.mime_type?.startsWith('video/') ? (
                  <div key={a.id} style={styles.videoWrap}>
                    <video src={a.public_url || ''} controls preload="metadata" playsInline style={styles.videoThumb} />
                  </div>
                ) : (
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
                )
              )}
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
                צלם תמונה אחרי התיקון
              </Button>
            </>
          ) : null}
        </div>

        <button type="button" style={styles.numCopyBtn(colors)} onClick={() => void copyTicketNumber()}>
          העתק מספר תקלה #{ticket.ticket_number}
        </button>
      </div>
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
    padding: '12px 14px',
    borderRadius: '14px',
    border: `1px solid ${c.border}`,
    borderInlineStart: `4px solid ${priorityBorder[priority] || c.border}`,
    background: c.surface,
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  }),
  compactRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '4px',
  } as CSSProperties,
  compactLoc: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '12px',
    fontWeight: 600,
    color: c.textMuted,
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  attendanceHint: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    color: c.primary,
    marginBottom: '6px',
    fontWeight: 600,
  }),
  compactDesc: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '13px',
    margin: 0,
    color: c.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right',
  }),
  card: (c: typeof theme.colors, priority: string): CSSProperties => ({
    padding: 0,
    borderRadius: '14px',
    border: `1px solid ${c.border}`,
    borderInlineStart: `4px solid ${priorityBorder[priority] || c.border}`,
    background: c.surface,
    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  }),
  collapseHeader: (c: typeof theme.colors): CSSProperties => ({
    display: 'block',
    width: '100%',
    textAlign: 'right',
    padding: '12px 14px',
    border: 'none',
    borderBottom: `1px solid ${c.border}`,
    background: c.muted,
    cursor: 'pointer',
  }),
  collapseHint: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    color: c.textMuted,
    marginInlineStart: 'auto',
    fontWeight: 600,
  }),
  expandedBody: {
    padding: '12px 14px 14px',
  } as CSSProperties,
  num: (c: typeof theme.colors): CSSProperties => ({
    fontWeight: 700,
    color: c.primary,
    fontSize: '15px',
  }),
  numCopyBtn: (c: typeof theme.colors): CSSProperties => ({
    background: 'none',
    border: 'none',
    padding: '8px 0 0',
    fontSize: '12px',
    fontWeight: 600,
    color: c.textMuted,
    cursor: 'pointer',
    textAlign: 'center',
    width: '100%',
  }),
  when: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    color: c.textMuted,
    marginInlineStart: 'auto',
  }),
  reporter: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '13px',
    fontWeight: 600,
    color: c.textPrimary,
    marginBottom: '8px',
  }),
  descClamp: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '15px',
    margin: '0 0 8px',
    lineHeight: 1.45,
    color: c.textPrimary,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }),
  descOpen: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '15px',
    margin: '0 0 8px',
    lineHeight: 1.45,
    color: c.textPrimary,
    whiteSpace: 'pre-wrap',
  }),
  toolRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  } as CSSProperties,
  linkBtn: (c: typeof theme.colors): CSSProperties => ({
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: c.primary,
    cursor: 'pointer',
  }),
  translationBox: (c: typeof theme.colors): CSSProperties => ({
    marginBottom: '12px',
    padding: '10px 12px',
    borderRadius: '10px',
    background: c.muted,
    maxHeight: '120px',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  }),
  translationLabel: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    fontWeight: 700,
    color: c.textMuted,
    marginBottom: '4px',
  }),
  translationText: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '14px',
    margin: 0,
    lineHeight: 1.45,
    color: c.textPrimary,
  }),
  section: (c: typeof theme.colors): CSSProperties => ({
    marginBottom: '14px',
    paddingBottom: '14px',
    borderBottom: `1px solid ${c.border}`,
  }),
  sectionTitle: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '13px',
    fontWeight: 800,
    color: c.textPrimary,
    marginBottom: '10px',
  }),
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '8px',
  } as CSSProperties,
  statusBtn: (
    c: typeof theme.colors,
    tone: 'primary' | 'muted' | 'success',
    active: boolean
  ): CSSProperties => {
    const palette =
      tone === 'success'
        ? { bg: c.successMuted, border: c.success, text: c.success }
        : tone === 'primary'
          ? { bg: c.primaryMuted, border: c.primary, text: c.primary }
          : { bg: c.muted, border: c.border, text: c.textSecondary }
    return {
      padding: '12px 8px',
      borderRadius: '12px',
      border: `2px solid ${active ? palette.border : c.border}`,
      background: active ? palette.bg : c.surface,
      color: active ? palette.text : c.textPrimary,
      fontSize: '13px',
      fontWeight: 700,
      cursor: 'pointer',
      lineHeight: 1.25,
      minHeight: '52px',
    }
  },
  moreStatusToggle: (c: typeof theme.colors): CSSProperties => ({
    marginTop: '8px',
    background: 'none',
    border: 'none',
    padding: '4px 0',
    fontSize: '12px',
    fontWeight: 600,
    color: c.textMuted,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'right',
  }),
  moreStatusRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '6px',
  } as CSSProperties,
  moreStatusBtn: (c: typeof theme.colors, active: boolean): CSSProperties => ({
    padding: '10px 14px',
    borderRadius: '10px',
    border: `1.5px solid ${active ? c.primary : c.border}`,
    background: active ? c.primaryMuted : c.muted,
    color: active ? c.primary : c.textSecondary,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  }),
  currentStatus: (c: typeof theme.colors): CSSProperties => ({
    marginTop: '8px',
    fontSize: '12px',
    color: c.textMuted,
  }),
  contactRowBig: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '10px',
  } as CSSProperties,
  contactBtn: (c: typeof theme.colors, kind: 'call' | 'nav'): CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    minHeight: '64px',
    padding: '12px 10px',
    borderRadius: '12px',
    border: `1.5px solid ${kind === 'call' ? c.success : c.primary}`,
    background: kind === 'call' ? c.successMuted : c.primaryMuted,
    color: kind === 'call' ? c.success : c.primary,
    fontSize: '14px',
    fontWeight: 700,
    textDecoration: 'none',
    textAlign: 'center',
    lineHeight: 1.25,
  }),
  contactBtnIcon: {
    fontSize: '22px',
    lineHeight: 1,
  } as CSSProperties,
  messageActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as CSSProperties,
  messageCard: (
    c: typeof theme.colors,
    expanded: boolean,
    kind: 'resident' | 'office'
  ): CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: `2px solid ${expanded ? c.primary : c.border}`,
    background: expanded ? c.primaryMuted : c.surface,
    cursor: 'pointer',
    textAlign: 'right',
    boxShadow: expanded ? `0 0 0 1px ${c.primary}` : 'none',
    borderInlineStart: `4px solid ${kind === 'resident' ? '#25D366' : c.primary}`,
  }),
  messageCardTitle: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '15px',
    fontWeight: 800,
    color: c.textPrimary,
  }),
  messageCardHint: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '12px',
    color: c.textMuted,
    lineHeight: 1.35,
  }),
  threadWrap: (c: typeof theme.colors): CSSProperties => ({
    marginBottom: '14px',
    padding: '12px',
    borderRadius: '12px',
    background: c.muted,
    border: `1px solid ${c.border}`,
  }),
  attachSection: (c: typeof theme.colors): CSSProperties => ({
    marginBottom: '8px',
    paddingTop: '4px',
  }),
  attachHead: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '13px',
    fontWeight: 700,
    color: c.textPrimary,
    marginBottom: '8px',
  }),
  attachMuted: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '13px',
    color: c.textMuted,
    margin: '0 0 8px',
  }),
  gallery: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '10px',
  } as CSSProperties,
  thumbWrap: {
    display: 'block',
    width: '80px',
    height: '80px',
    borderRadius: '10px',
    overflow: 'hidden',
    flexShrink: 0,
  } as CSSProperties,
  thumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  } as CSSProperties,
  videoWrap: {
    width: '128px',
    height: '80px',
    borderRadius: '10px',
    overflow: 'hidden',
    flexShrink: 0,
    background: '#000',
  } as CSSProperties,
  videoThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  } as CSSProperties,
}
