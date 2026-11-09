'use client'

import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, PriorityDot, StatusBadge, theme } from '../ui'
import { isTicketStatus, ticketStatusLabelHe, type TicketStatus } from '@/lib/ticket-status'
import { formatRelativeTimeHe } from '@/lib/relative-time-he'
import { telHref, wazeHref } from '@/lib/contact-links'
import { toast } from '@/lib/error-handler'
import { formatReporterNameAndPhone } from '@/lib/reporter-display'

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
  canMarkEscort?: boolean
  onEscort?: (note: string, file: File | null) => void
  escortBusy?: boolean
}

const QUICK_STATUSES: { value: TicketStatus; label: string; tone: 'primary' | 'muted' | 'success' }[] = [
  { value: 'IN_PROGRESS', label: 'התחלתי לטפל', tone: 'primary' },
  { value: 'WAITING_PARTS', label: 'ממתין לחלקים', tone: 'muted' },
  { value: 'CLOSED', label: 'סגור תקלה', tone: 'success' },
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

function shortProblem(desc: string): string {
  const line = desc.replace(/\s+/g, ' ').trim()
  if (line.length <= 68) return line
  return `${line.slice(0, 66).trim()}…`
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
  canMarkEscort = false,
  onEscort,
  escortBusy = false,
}: WorkerTicketCardProps) {
  const [descOpen, setDescOpen] = useState(false)
  const [moreStatusOpen, setMoreStatusOpen] = useState(false)
  const [escortOpen, setEscortOpen] = useState(false)
  const [escortNote, setEscortNote] = useState('')
  const [escortFile, setEscortFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const escortFileRef = useRef<HTMLInputElement>(null)
  const desc = ticket.description?.trim() || '—'
  const longDesc = desc.length > 120
  const priority = ticket.priority || 'MEDIUM'
  const relativeWhen = formatRelativeTimeHe(ticket.created_at)
  const loc = locationLine(ticket)
  const tel = telHref(ticket.reporter_phone)
  const reporterLabel = formatReporterNameAndPhone(ticket.reporter_name, ticket.reporter_phone)
  const waze = wazeHref(ticket.project_address)
  const hasResidentPhone = !!ticket.reporter_phone && !!onToggleWa
  const showQuickActions = !!(tel || waze || hasResidentPhone)
  const mediaAttachments = attachments.filter(
    (a) => (a.mime_type?.startsWith('image/') || a.mime_type?.startsWith('video/')) && a.public_url
  )
  const completionPhotos = mediaAttachments.filter((a) => a.attachment_type === 'worker_completion')
  const otherMedia = mediaAttachments.filter((a) => a.attachment_type !== 'worker_completion')
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

  const urgent = priority === 'URGENT' || priority === 'HIGH'
  const started = ticket.status === 'IN_PROGRESS' || ticket.status === 'WAITING_PARTS'

  if (!isActive && !expandedChat && !expandedWa) {
    return (
      <button
        type="button"
        className="worker-card-expand"
        style={styles.compact(colors, priority)}
        onClick={onActivate}
        aria-expanded={false}
      >
        <span style={styles.rowBody}>
          <span style={styles.compactLoc(colors)}>{loc || `#${ticket.ticket_number}`}</span>
          <span style={styles.compactDesc(colors)}>{shortProblem(desc)}</span>
        </span>
        <span style={styles.rowMeta}>
          {urgent ? <PriorityDot priority={priority} /> : null}
          {started ? <StatusBadge status={ticket.status} size="sm" /> : null}
          <span style={styles.when(colors)}>{relativeWhen}</span>
        </span>
      </button>
    )
  }

  return (
    <article className="worker-card-expand" style={styles.card(colors, priority)}>
      <button
        type="button"
        style={styles.collapseHeader(colors)}
        onClick={onActivate}
        aria-expanded={true}
        aria-label={`כווץ תקלה ${ticket.ticket_number}`}
      >
        <div style={styles.jobKicker(colors)}>
          <span>#{ticket.ticket_number}</span>
          <span>{relativeWhen}</span>
          {started ? <StatusBadge status={ticket.status} size="sm" /> : null}
          <span style={styles.collapseHint(colors)}>כווץ</span>
        </div>
        <div style={styles.jobTitle(colors)}>{loc || `תקלה ${ticket.ticket_number}`}</div>
      </button>

      <div style={styles.expandedBody}>
        {reporterLabel ? <div style={styles.reporter(colors)}>דיווח: {reporterLabel}</div> : null}

        <p style={descOpen ? styles.descOpen(colors) : styles.descClamp(colors)}>{desc}</p>

        {longDesc ? (
          <div style={styles.toolRow}>
            <button type="button" style={styles.linkBtn(colors)} onClick={() => setDescOpen((v) => !v)}>
              {descOpen ? 'פחות' : 'קרא עוד'}
            </button>
          </div>
        ) : null}

        {translation ? (
          <div style={styles.translationBox(colors)}>
            <div style={styles.translationLabel(colors)}>תרגום</div>
            <p style={styles.translationText(colors)}>{translation}</p>
          </div>
        ) : null}

        {attachmentsLoading ? (
          <p style={styles.attachMuted(colors)}>טוען תמונות…</p>
        ) : otherMedia.length > 0 || completionPhotos.length > 0 ? (
          <div style={styles.attachSection}>
            {otherMedia.length > 0 ? (
              <div style={styles.gallery}>
                {otherMedia.map((a) =>
                  a.mime_type?.startsWith('video/') ? (
                    <div key={a.id} style={styles.videoWrap}>
                      <video src={a.public_url || ''} controls preload="metadata" playsInline style={styles.videoThumb} />
                      <span style={styles.videoLabel}>סרטון</span>
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
            ) : null}
            {completionPhotos.length > 0 ? (
              <>
                <p style={styles.attachReady(colors)}>תמונה שמורה — תישלח לדייר בסגירה</p>
                <div style={styles.gallery}>
                  {completionPhotos.map((a) => (
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
              </>
            ) : null}
          </div>
        ) : null}

        {showQuickActions ? (
          <div style={styles.actionsBlock}>
            <div
              style={
                tel && waze && hasResidentPhone
                  ? styles.quickActionsThree
                  : styles.quickActionsRow
              }
            >
              {tel ? (
                <a href={tel} className="lg-glass" style={styles.quickBtn(colors, 'call')} aria-label="התקשר לדייר">
                  <span style={styles.quickBtnIcon} aria-hidden>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </span>
                  <span>חייג</span>
                </a>
              ) : null}
              {waze ? (
                <a
                  href={waze}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lg-glass"
                  style={styles.quickBtn(colors, 'waze')}
                  aria-label="ניווט Waze"
                >
                  <span style={styles.quickBtnIcon} aria-hidden>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </span>
                  <span>נווט</span>
                </a>
              ) : null}
              {hasResidentPhone ? (
                <button
                  type="button"
                  onClick={onToggleWa}
                  className="lg-glass"
                  style={styles.quickBtn(colors, 'whatsapp', expandedWa)}
                  aria-label="WhatsApp לדייר"
                >
                  <span style={styles.quickBtnIcon} aria-hidden>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.4 8.4 0 0 1-9.2 8.4 8.4 8.4 0 0 1-3.5-.8L3 21l1.9-5.1a8.4 8.4 0 1 1 16.1-4.4Z" />
                    </svg>
                  </span>
                  <span>וואטסאפ</span>
                </button>
              ) : null}
            </div>
            {expandedWa && waSlot ? <div className="wa-ticket-frame" style={{ marginTop: 12 }}>{waSlot}</div> : null}
          </div>
        ) : null}

        <button
          type="button"
          disabled={statusBusy}
          onClick={() => onStatusChange('CLOSED')}
          style={styles.closeBtn(colors, ticket.status === 'CLOSED')}
        >
          סיימתי
        </button>
        <div style={styles.statusPair}>
          {QUICK_STATUSES.filter((opt) => opt.value !== 'CLOSED').map((opt) => {
            const active = ticket.status === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                disabled={statusBusy}
                onClick={() => onStatusChange(opt.value)}
                className={active ? 'lg-nav-active' : 'lg-glass'}
                style={styles.statusBtn(colors, opt.tone, active)}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {canMarkEscort && onEscort && ticket.status !== 'CLOSED' ? (
          <div style={styles.section(colors)}>
            <button
              type="button"
              style={styles.moreStatusToggle(colors)}
              onClick={() => setEscortOpen((v) => !v)}
            >
              {escortOpen ? '▼ ליווי בעל מקצוע' : '▶ ליווי בעל מקצוע'}
            </button>
            {escortOpen ? (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 13, color: colors.textSecondary, margin: '0 0 8px' }}>
                  מסמנים ליווי בלי לסגור את התקלה. אפשר להוסיף הערה ותמונה.
                </p>
                <textarea
                  value={escortNote}
                  onChange={(e) => setEscortNote(e.target.value)}
                  placeholder='לדוגמה: החשמלאי הגיע, נדרש חלק נוסף'
                  rows={2}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    borderRadius: 10,
                    border: `1px solid ${colors.border}`,
                    padding: 10,
                    marginBottom: 8,
                    fontSize: 14,
                  }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={escortBusy}
                    onClick={() => escortFileRef.current?.click()}
                  >
                    {escortFile ? escortFile.name.slice(0, 18) : 'צרף תמונה'}
                  </Button>
                  <input
                    ref={escortFileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      setEscortFile(e.target.files?.[0] || null)
                      e.target.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    disabled={escortBusy}
                    onClick={() => {
                      onEscort(escortNote, escortFile)
                      setEscortNote('')
                      setEscortFile(null)
                      setEscortOpen(false)
                    }}
                  >
                    {escortBusy ? 'שומר…' : 'סמן ליווי'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {onUploadPhoto ? (
          <div style={styles.photoRow}>
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
              size="md"
              loading={uploadingPhoto}
              onClick={() => fileInputRef.current?.click()}
              style={{ width: '100%' }}
            >
              צלם לדייר (לא חובה)
            </Button>
          </div>
        ) : null}

        <button
          type="button"
          style={styles.moreStatusToggle(colors)}
          onClick={() => setMoreStatusOpen((v) => !v)}
        >
          {showMoreStatus ? '▼ אפשרויות נוספות' : '▶ אפשרויות נוספות'}
        </button>
        {showMoreStatus ? (
          <div style={styles.morePanel}>
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
            <button type="button" onClick={onToggleChat} style={styles.officeLink(colors, expandedChat)}>
              {expandedChat ? '▲ סגור הודעה למשרד' : 'הודעה למשרד בלבד (הדייר לא רואה)'}
            </button>
            {desc !== '—' ? (
              <button type="button" style={styles.linkBtn(colors)} onClick={onTranslate} disabled={translating}>
                {translating ? 'מתרגם…' : 'תרגום לעברית'}
              </button>
            ) : null}
            <button type="button" style={styles.numCopyBtn(colors)} onClick={() => void copyTicketNumber()}>
              העתק מספר תקלה #{ticket.ticket_number}
            </button>
            <div style={styles.currentStatus(colors)}>
              עכשיו: {ticketStatusLabelHe(ticket.status, { feminine: true })}
            </div>
          </div>
        ) : null}

        {expandedChat && chatSlot ? <div style={styles.threadWrap(colors)}>{chatSlot}</div> : null}
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
    textAlign: 'right',
    padding: '14px 2px',
    border: 'none',
    borderBottom: `1px solid ${c.border}`,
    borderInlineStart: priority === 'URGENT' || priority === 'HIGH' ? `3px solid ${priorityBorder[priority]}` : 'none',
    background: 'transparent',
    cursor: 'pointer',
    minHeight: 56,
  }),
  rowBody: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    minWidth: 0,
    flex: 1,
    gap: 2,
  } as CSSProperties,
  rowMeta: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  } as CSSProperties,
  compactRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '4px',
  } as CSSProperties,
  compactLoc: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '17px',
    fontWeight: 750,
    color: c.textPrimary,
    letterSpacing: '-0.02em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  }),
  compactDesc: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '14px',
    margin: 0,
    color: c.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right',
    maxWidth: '100%',
  }),
  card: (c: typeof theme.colors, priority: string): CSSProperties => ({
    padding: 0,
    borderRadius: 22,
    border: 'none',
    background: c.surface,
    boxShadow: '0 10px 28px rgba(16, 43, 70, 0.08)',
    borderInlineStart: priority === 'URGENT' || priority === 'HIGH' ? `4px solid ${priorityBorder[priority]}` : 'none',
    overflow: 'hidden',
    margin: '8px 0 14px',
  }),
  jobKicker: (c: typeof theme.colors): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    fontSize: 12,
    fontWeight: 650,
    color: c.textMuted,
    marginBottom: 4,
  }),
  jobTitle: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 'clamp(22px, 6.4vw, 26px)',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.2,
    color: c.textPrimary,
    textAlign: 'right',
    overflowWrap: 'anywhere',
  }),
  collapseHeader: (c: typeof theme.colors): CSSProperties => ({
    display: 'block',
    width: '100%',
    textAlign: 'right',
    padding: '12px 14px',
    border: 'none',
    borderBottom: `0.5px solid ${c.border}`,
    background: 'transparent',
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
    overflowWrap: 'anywhere',
  }),
  descClamp: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '18px',
    margin: '0 0 14px',
    lineHeight: 1.4,
    color: c.textPrimary,
    display: '-webkit-box',
    WebkitLineClamp: 4,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }),
  descOpen: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '18px',
    margin: '0 0 14px',
    lineHeight: 1.4,
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
  actionsBlock: {
    marginBottom: '12px',
  } as CSSProperties,
  closeBtn: (c: typeof theme.colors, active: boolean): CSSProperties => ({
    width: '100%',
    minHeight: 58,
    marginBottom: 8,
    borderRadius: 16,
    border: 'none',
    background: active ? c.successMuted : c.success,
    color: active ? c.success : '#fff',
    fontSize: '18px',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    cursor: 'pointer',
  }),
  statusPair: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginBottom: '10px',
  } as CSSProperties,
  photoRow: {
    marginBottom: '12px',
  } as CSSProperties,
  morePanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
    marginTop: '4px',
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
      borderRadius: 14,
      border: active ? `1.5px solid ${palette.border}` : 'none',
      background: active ? palette.bg : 'transparent',
      color: active ? palette.text : c.textPrimary,
      fontSize: '14px',
      fontWeight: 700,
      cursor: 'pointer',
      lineHeight: 1.25,
      minHeight: 48,
      whiteSpace: 'normal',
    }
  },
  moreStatusToggle: (c: typeof theme.colors): CSSProperties => ({
    marginTop: '8px',
    background: 'none',
    border: 'none',
    padding: '10px 0',
    minHeight: 44,
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
  quickActionsThree: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '8px',
  } as CSSProperties,
  quickActionsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: '8px',
  } as CSSProperties,
  quickBtn: (
    c: typeof theme.colors,
    kind: 'call' | 'waze' | 'whatsapp',
    active = false
  ): CSSProperties => {
    const palette =
      kind === 'call'
        ? { bg: c.successMuted, text: c.success }
        : kind === 'whatsapp'
          ? { bg: active ? '#dcf8c6' : '#e8f8ee', text: '#128C7E' }
          : { bg: c.primaryMuted, text: c.primary }
    return {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      minHeight: '64px',
      padding: '8px 6px',
      borderRadius: 16,
      border: 'none',
      background: palette.bg,
      color: palette.text,
      fontSize: '14px',
      fontWeight: 800,
      maxWidth: '100%',
      overflow: 'hidden',
      textDecoration: 'none',
      textAlign: 'center',
      lineHeight: 1.25,
      cursor: 'pointer',
    }
  },
  quickBtnIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  } as CSSProperties,
  officeRow: {
    marginBottom: '12px',
  } as CSSProperties,
  officeLink: (c: typeof theme.colors, expanded: boolean): CSSProperties => ({
    background: 'none',
    border: 'none',
    padding: '6px 0',
    fontSize: '13px',
    fontWeight: 600,
    color: expanded ? c.primary : c.textMuted,
    cursor: 'pointer',
    textAlign: 'right',
    width: '100%',
    textDecoration: expanded ? 'none' : 'underline',
  }),
  threadWrap: (c: typeof theme.colors): CSSProperties => ({
    marginBottom: '14px',
    padding: '12px',
    borderRadius: '12px',
    background: c.muted,
    border: `1px solid ${c.border}`,
  }),
  attachSection: {
    marginBottom: '8px',
    paddingTop: '4px',
  } as CSSProperties,
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
  attachReady: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '12px',
    fontWeight: 600,
    color: c.success,
    margin: '0 0 8px',
  }),
  attachHint: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    color: c.textMuted,
    margin: '8px 0 0',
    lineHeight: 1.35,
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
    position: 'relative',
    width: '128px',
    height: '80px',
    borderRadius: '10px',
    overflow: 'hidden',
    flexShrink: 0,
    background: '#1c1c1e',
  } as CSSProperties,
  videoLabel: {
    position: 'absolute',
    insetInlineStart: 6,
    bottom: 6,
    padding: '2px 6px',
    borderRadius: 6,
    background: 'rgba(0,0,0,0.65)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    pointerEvents: 'none',
  } as CSSProperties,
  videoThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  } as CSSProperties,
}
