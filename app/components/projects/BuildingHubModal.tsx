'use client'

/**
 * BuildingHubModal — centered building hub (replaces detail side Drawer on /projects).
 * Tabs: overview | finance | committee | docs | residents | decisions | settings.
 * Finance/committee/residents/decisions are Wave 3/4 placeholders.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { formatReporterNameAndPhone } from '@/lib/reporter-display'
import {
  Button,
  LoadingSpinner,
  Select,
  StatusBadge,
  theme,
} from '@/app/components/ui'
import { CollapsibleSection } from '@/app/components/shared/CollapsibleSection'
import { ResidentPortalDocsPanel } from '@/app/components/projects/ResidentPortalDocsPanel'
import { ProjectAdvancedActions } from '@/app/components/projects/ProjectAdvancedActions'

export type BuildingHubProject = {
  id: string
  name: string
  project_code: string
  address: string | null
  address_en: string | null
  is_active: boolean
  client_id: string
  assigned_worker_id?: string | null
}

export type BuildingHubWorker = { id: string; full_name: string }

export type BuildingHubTicket = {
  id: string
  ticket_number: number
  status: string
  description?: string | null
  closed_at?: string | null
  reporter_phone?: string | null
  reporter_name?: string | null
}

type HubTab =
  | 'overview'
  | 'finance'
  | 'committee'
  | 'docs'
  | 'residents'
  | 'decisions'
  | 'settings'

const TABS: { id: HubTab; label: string }[] = [
  { id: 'overview', label: 'סקירה' },
  { id: 'finance', label: 'כספים' },
  { id: 'committee', label: 'ועד' },
  { id: 'docs', label: 'מסמכים' },
  { id: 'residents', label: 'דיירים' },
  { id: 'decisions', label: 'החלטות' },
  { id: 'settings', label: 'הגדרות' },
]

type Props = {
  open: boolean
  onClose: () => void
  project: BuildingHubProject | null
  workers: BuildingHubWorker[]
  isMobile?: boolean
  openTickets: BuildingHubTicket[]
  closedTickets: BuildingHubTicket[]
  loadingTickets: boolean
  exportingHistory: boolean
  onAssignWorker: (workerId: string) => void
  onOpenEdit: (project: BuildingHubProject) => void
  onExportHistory: (project: BuildingHubProject) => void
  onToggleActive: (project: BuildingHubProject) => void
  onDelete: (project: BuildingHubProject) => void
  onOpenTicket: (ticketId: string) => void
}

function ComingSoon({ title, wave }: { title: string; wave: string }) {
  return (
    <div style={styles.placeholder}>
      <p style={styles.placeholderTitle}>{title}</p>
      <p style={styles.placeholderBody}>בפיתוח — {wave}</p>
    </div>
  )
}

export function BuildingHubModal({
  open,
  onClose,
  project,
  workers,
  isMobile = false,
  openTickets,
  closedTickets,
  loadingTickets,
  exportingHistory,
  onAssignWorker,
  onOpenEdit,
  onExportHistory,
  onToggleActive,
  onDelete,
  onOpenTicket,
}: Props) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<HubTab>('overview')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [closeHovered, setCloseHovered] = useState(false)

  useFocusTrap(panelRef, open && !!project)

  useEffect(() => {
    if (!open) return
    setTab('overview')
    setHistoryOpen(false)
    setCloseHovered(false)
  }, [open, project?.id])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || !project || typeof document === 'undefined') return null

  const overlayStyle: CSSProperties = isMobile
    ? { ...styles.overlay, ...styles.overlayMobile }
    : styles.overlay

  const panelStyle: CSSProperties = isMobile
    ? { ...styles.panel, ...styles.panelMobile }
    : styles.panel

  let body: ReactNode = null
  if (tab === 'overview') {
    body = (
      <div style={styles.stack}>
        <div style={styles.detailSection}>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>סטטוס</span>
            <StatusBadge status={project.is_active ? 'ACTIVE' : 'INACTIVE'} />
          </div>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>כתובת</span>
            <span style={styles.detailValue}>{project.address || '-'}</span>
          </div>
          {project.address_en ? (
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>כתובת (EN)</span>
              <span style={{ ...styles.detailValue, direction: 'ltr', textAlign: 'left' }}>
                {project.address_en}
              </span>
            </div>
          ) : null}
          <div style={{ ...styles.detailRow, ...styles.detailRowLast }}>
            <span style={styles.detailLabel}>עובד אחזקה</span>
            <div style={styles.workerSelectWrap} onClick={(e) => e.stopPropagation()}>
              <Select
                value={project.assigned_worker_id || ''}
                onChange={(value) => onAssignWorker(value)}
                options={[
                  { label: 'לא שויך', value: '' },
                  ...workers.map((w) => ({ label: w.full_name, value: w.id })),
                ]}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        <div>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>תקלות פעילות</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                window.location.href = `/tickets?project=${encodeURIComponent(project.project_code)}`
              }}
            >
              לכל התקלות
            </Button>
          </div>

          {loadingTickets ? (
            <div style={styles.loadingSmall}>
              <LoadingSpinner size="sm" />
            </div>
          ) : openTickets.length === 0 ? (
            <p style={styles.emptyText}>אין תקלות פעילות לפרויקט זה</p>
          ) : (
            <div style={styles.ticketList}>
              {openTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  style={{ ...styles.ticketItem, ...styles.ticketItemButton }}
                  onClick={() => onOpenTicket(ticket.id)}
                >
                  <span style={styles.ticketNumber}>#{ticket.ticket_number}</span>
                  <StatusBadge status={ticket.status} size="sm" />
                  <span style={styles.mutedMeta}>
                    {formatReporterNameAndPhone(ticket.reporter_name, ticket.reporter_phone) || '—'}
                  </span>
                </button>
              ))}
            </div>
          )}

          <CollapsibleSection
            title="היסטוריית תקלות"
            badge={closedTickets.length > 0 ? String(closedTickets.length) : undefined}
            open={historyOpen}
            onToggle={() => setHistoryOpen((v) => !v)}
          >
            {loadingTickets ? (
              <div style={styles.loadingSmall}>
                <LoadingSpinner size="sm" />
              </div>
            ) : closedTickets.length === 0 ? (
              <p style={styles.emptyText}>אין תקלות סגורות בהיסטוריה</p>
            ) : (
              <>
                <div style={styles.ticketList}>
                  {closedTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      style={{ ...styles.ticketHistoryItem, ...styles.ticketItemButton }}
                      onClick={() => onOpenTicket(ticket.id)}
                    >
                      <div style={styles.ticketHistoryTop}>
                        <span style={styles.ticketNumber}>#{ticket.ticket_number}</span>
                        <StatusBadge status={ticket.status} size="sm" />
                      </div>
                      <p style={styles.ticketHistoryDesc}>
                        {ticket.description?.slice(0, 80)}
                        {(ticket.description?.length || 0) > 80 ? '…' : ''}
                      </p>
                      <span style={styles.mutedMeta}>
                        {formatReporterNameAndPhone(ticket.reporter_name, ticket.reporter_phone) ||
                          '—'}
                      </span>
                      <span style={styles.mutedMeta}>
                        נסגרה:{' '}
                        {ticket.closed_at
                          ? new Date(ticket.closed_at).toLocaleString('he-IL')
                          : '—'}
                      </span>
                    </button>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={exportingHistory}
                  onClick={() => onExportHistory(project)}
                  style={{ width: '100%', marginTop: 8 }}
                >
                  ייצוא היסטוריה ל-Excel
                </Button>
              </>
            )}
          </CollapsibleSection>
        </div>
      </div>
    )
  } else if (tab === 'docs') {
    body = (
      <div style={styles.stack}>
        <p style={styles.docsHint}>
          מסמכים לפורטל הדיירים — בחרו מה הדיירים רואים (visibility). הרחבת עין/הרשאות תגיע ב־Wave 4.
        </p>
        <ResidentPortalDocsPanel projectId={project.id} />
      </div>
    )
  } else if (tab === 'settings') {
    body = (
      <div style={styles.stack}>
        <div style={styles.settingsActions}>
          <Button
            variant="secondary"
            onClick={() => onOpenEdit(project)}
            style={styles.settingsActionBtn}
          >
            עריכת פרויקט
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              window.location.href = `/qr?project=${encodeURIComponent(project.project_code)}`
            }}
            style={styles.settingsActionBtn}
          >
            צפייה ב-QR
          </Button>
        </div>
        <ProjectAdvancedActions
          projectId={project.id}
          projectName={project.name}
          projectCode={project.project_code}
          clientId={project.client_id}
          isActive={project.is_active}
          onToggleActive={() => onToggleActive(project)}
          onDelete={() => onDelete(project)}
        />
      </div>
    )
  } else if (tab === 'finance') {
    body = <ComingSoon title="הנהלת חשבונות, הוצאות ותקציב בניין" wave="Wave 3" />
  } else if (tab === 'committee') {
    body = <ComingSoon title="ועד הבית — ניהול והחלטות שוטפות" wave="Wave 4" />
  } else if (tab === 'residents') {
    body = <ComingSoon title="דיירים בפרויקט — רישום ופורטל" wave="Wave 4" />
  } else {
    body = <ComingSoon title="החלטות דיירים וחתימות (רוב)" wave="Wave 4" />
  }

  return createPortal(
    <div style={overlayStyle} onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        data-building-hub="true"
      >
        <header style={styles.header}>
          <div style={styles.headerText}>
            <p style={styles.eyebrow}>מרכז הבניין · BINO</p>
            <h2 id={titleId} style={styles.title}>
              {project.name}
            </h2>
            <p style={styles.subtitle}>{project.address || 'פרטי הבניין'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...styles.closeButton,
              ...(closeHovered ? styles.closeButtonHover : null),
            }}
            aria-label="סגירה"
            onMouseEnter={() => setCloseHovered(true)}
            onMouseLeave={() => setCloseHovered(false)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        <nav style={styles.tabBar} aria-label="טאבי מרכז הבניין">
          <div style={styles.tabTrack}>
            {TABS.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  style={{
                    ...styles.tab,
                    ...(active ? styles.tabActive : null),
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </nav>

        <div style={styles.body}>{body}</div>
      </div>
    </div>,
    document.body
  )
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 320,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    background: theme.colors.overlay,
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    animation: 'fadeIn 0.2s ease',
  },
  overlayMobile: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    width: 'min(720px, calc(100vw - 48px))',
    height: 'min(680px, calc(100vh - 64px))',
    maxHeight: 'calc(100vh - 64px)',
    display: 'flex',
    flexDirection: 'column',
    background: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    border: `1px solid ${theme.colors.border}`,
    boxShadow: theme.shadows.xl,
    overflow: 'hidden',
    animation: 'hubModalIn 0.22s ease',
    transformOrigin: 'center center',
  },
  panelMobile: {
    width: 'calc(100% - 4px)',
    height: 'calc(100dvh - 20px)',
    maxHeight: 'calc(100dvh - 20px)',
    borderRadius: theme.radius.xl,
    marginTop: 'env(safe-area-inset-top, 0px)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: `${theme.spacing.xl} ${theme.spacing.xl} ${theme.spacing.lg}`,
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    background: `linear-gradient(180deg, ${theme.colors.blueSoft} 0%, ${theme.colors.surface} 72%)`,
    flexShrink: 0,
  },
  headerText: {
    minWidth: 0,
    flex: 1,
    paddingTop: 2,
  },
  eyebrow: {
    margin: 0,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary,
    letterSpacing: '0.02em',
  },
  title: {
    margin: '6px 0 0',
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    lineHeight: 1.25,
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.4,
  },
  closeButton: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    marginTop: 2,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    boxShadow: theme.shadows.xs,
    transition: `background ${theme.motion.fast} ease, border-color ${theme.motion.fast} ease, color ${theme.motion.fast} ease`,
  },
  closeButtonHover: {
    background: theme.colors.surfaceHover,
    borderColor: theme.colors.borderStrong,
    color: theme.colors.textPrimary,
  },
  tabBar: {
    flexShrink: 0,
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    background: theme.colors.surface,
    overflowX: 'auto',
    scrollbarWidth: 'thin' as const,
  },
  tabTrack: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    minWidth: '100%',
    padding: 4,
    borderRadius: theme.radius.lg,
    background: theme.colors.surfaceInset,
    boxSizing: 'border-box' as const,
  },
  tab: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    padding: '6px 12px',
    borderRadius: theme.radius.full,
    border: '1px solid transparent',
    background: 'transparent',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
    transition: `background ${theme.motion.fast} ease, color ${theme.motion.fast} ease, border-color ${theme.motion.fast} ease`,
  },
  tabActive: {
    background: theme.colors.surface,
    borderColor: theme.colors.borderSelected,
    color: theme.colors.primary,
    boxShadow: theme.shadows.xs,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    overscrollBehavior: 'contain',
    padding: theme.spacing.xl,
    paddingBottom: `calc(${theme.spacing.xl} + env(safe-area-inset-bottom, 0px))`,
    background: theme.colors.background,
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.xl,
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
    background: theme.colors.surface,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    boxShadow: theme.shadows.xs,
    overflow: 'hidden',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 52,
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
  },
  detailRowLast: {
    borderBottom: 'none',
  },
  detailLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    flexShrink: 0,
    fontWeight: theme.typography.fontWeight.medium,
  },
  detailValue: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    textAlign: 'left' as const,
    fontWeight: theme.typography.fontWeight.medium,
    minWidth: 0,
  },
  workerSelectWrap: {
    flex: 1,
    minWidth: 0,
    maxWidth: 280,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    margin: 0,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  loadingSmall: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px 0',
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: theme.typography.fontSize.sm,
    padding: '24px 0',
  },
  ticketList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  ticketItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: '12px 14px',
    background: theme.colors.surface,
    borderRadius: theme.radius.md,
  },
  ticketItemButton: {
    width: '100%',
    border: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'right' as const,
    boxShadow: theme.shadows.xs,
  },
  ticketNumber: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  mutedMeta: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
  },
  ticketHistoryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '12px 14px',
    background: theme.colors.surface,
    borderRadius: theme.radius.md,
    textAlign: 'right' as const,
  },
  ticketHistoryTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketHistoryDesc: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    lineHeight: 1.4,
  },
  docsHint: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
  settingsActions: {
    display: 'flex',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  settingsActionBtn: {
    flex: '1 1 160px',
    minWidth: 140,
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 240,
    padding: theme.spacing.xxl,
    textAlign: 'center',
    background: theme.colors.surface,
    borderRadius: theme.radius.lg,
    border: `1px dashed ${theme.colors.borderStrong}`,
  },
  placeholderTitle: {
    margin: 0,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  placeholderBody: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
  },
}
