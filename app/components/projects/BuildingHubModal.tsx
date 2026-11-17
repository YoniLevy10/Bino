'use client'

/**
 * BuildingHubModal — centered building hub (replaces detail side Drawer on /projects).
 * Tabs: overview | finance | reports | committee | docs | residents | decisions | settings.
 * Finance/Reports: Wave 3. Governance tabs (ועד/מסמכים/דיירים/החלטות): Wave 4.
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
import { BuildingFinancePanel } from '@/app/components/projects/BuildingFinancePanel'
import { BuildingReportsPanel } from '@/app/components/projects/BuildingReportsPanel'
import { BuildingCommitteePanel } from '@/app/components/projects/BuildingCommitteePanel'
import { BuildingResidentsPanel } from '@/app/components/projects/BuildingResidentsPanel'
import { BuildingDecisionsPanel } from '@/app/components/projects/BuildingDecisionsPanel'

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
  | 'reports'
  | 'committee'
  | 'docs'
  | 'residents'
  | 'decisions'
  | 'settings'

const TABS: { id: HubTab; label: string }[] = [
  { id: 'overview', label: 'סקירה' },
  { id: 'finance', label: 'כספים' },
  { id: 'reports', label: 'דוחות' },
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
  if (tab === 'docs') {
    body = <ResidentPortalDocsPanel projectId={project.id} isMobile={isMobile} />
  } else if (tab === 'settings') {
    body = (
      <div style={styles.stack}>
        <div
          style={{
            ...styles.settingsActions,
            ...(isMobile ? styles.settingsActionsMobile : null),
          }}
        >
          <Button
            variant="secondary"
            onClick={() => onOpenEdit(project)}
            style={{
              ...styles.settingsActionBtn,
              ...(isMobile ? styles.settingsActionBtnMobile : null),
            }}
          >
            עריכת פרויקט
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              window.location.href = `/qr?project=${encodeURIComponent(project.project_code)}`
            }}
            style={{
              ...styles.settingsActionBtn,
              ...(isMobile ? styles.settingsActionBtnMobile : null),
            }}
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
    body = (
      <BuildingFinancePanel
        projectId={project.id}
        projectName={project.name}
        isMobile={isMobile}
        openTickets={openTickets}
      />
    )
  } else if (tab === 'reports') {
    body = (
      <BuildingReportsPanel
        projectId={project.id}
        projectName={project.name}
        isMobile={isMobile}
      />
    )
  } else if (tab === 'committee') {
    body = (
      <BuildingCommitteePanel
        projectId={project.id}
        projectName={project.name}
        isMobile={isMobile}
      />
    )
  } else if (tab === 'residents') {
    body = (
      <BuildingResidentsPanel
        projectId={project.id}
        projectName={project.name}
        projectCode={project.project_code}
        clientId={project.client_id}
        isMobile={isMobile}
      />
    )
  } else if (tab === 'decisions') {
    body = (
      <BuildingDecisionsPanel
        projectId={project.id}
        projectName={project.name}
        isMobile={isMobile}
      />
    )
  }

  return createPortal(
    <div
      style={overlayStyle}
      className={isMobile ? 'app-modal-backdrop-mobile' : undefined}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={isMobile ? 'app-modal-sheet-root' : undefined}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        data-building-hub="true"
      >
        <header style={{ ...styles.header, ...(isMobile ? styles.headerMobile : null) }}>
          <div style={styles.headerText}>
            <p style={styles.eyebrow}>מרכז הבניין · BINO</p>
            <h2
              id={titleId}
              style={{ ...styles.title, ...(isMobile ? styles.titleMobile : null) }}
            >
              {project.name}
            </h2>
            <p style={styles.subtitle}>{project.address || 'פרטי הבניין'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...styles.closeButton,
              ...(isMobile ? styles.closeButtonMobile : null),
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

        <nav
          style={{ ...styles.tabBar, ...(isMobile ? styles.tabBarMobile : null) }}
          aria-label="טאבי מרכז הבניין"
        >
          <div style={{ ...styles.tabTrack, ...(isMobile ? styles.tabTrackMobile : null) }}>
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
                    ...(isMobile ? styles.tabCompact : null),
                    ...(active ? styles.tabActive : null),
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </nav>

        <div
          className={isMobile ? 'app-modal-sheet-scroll' : undefined}
          style={{ ...styles.body, ...(isMobile ? styles.bodyMobile : null) }}
        >
          {tab === 'overview' ? (
            <div style={styles.stack}>
              <div style={styles.detailSection}>
                <div
                  style={{
                    ...styles.detailRow,
                    ...(isMobile ? styles.detailRowMobile : null),
                  }}
                >
                  <span style={styles.detailLabel}>סטטוס</span>
                  <StatusBadge status={project.is_active ? 'ACTIVE' : 'INACTIVE'} />
                </div>
                <div
                  style={{
                    ...styles.detailRow,
                    ...(isMobile ? styles.detailRowMobile : null),
                  }}
                >
                  <span style={styles.detailLabel}>כתובת</span>
                  <span style={styles.detailValue}>{project.address || '-'}</span>
                </div>
                {project.address_en ? (
                  <div
                    style={{
                      ...styles.detailRow,
                      ...(isMobile ? styles.detailRowMobile : null),
                    }}
                  >
                    <span style={styles.detailLabel}>כתובת (EN)</span>
                    <span style={{ ...styles.detailValue, direction: 'ltr', textAlign: 'left' }}>
                      {project.address_en}
                    </span>
                  </div>
                ) : null}
                <div
                  style={{
                    ...styles.detailRow,
                    ...styles.detailRowLast,
                    ...(isMobile ? styles.detailRowMobile : null),
                  }}
                >
                  <span style={styles.detailLabel}>עובד אחזקה</span>
                  <div
                    style={{
                      ...styles.workerSelectWrap,
                      ...(isMobile ? styles.workerSelectWrapMobile : null),
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
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
                <div
                  style={{
                    ...styles.sectionHeader,
                    ...(isMobile ? styles.sectionHeaderMobile : null),
                  }}
                >
                  <h3 style={styles.sectionTitle}>תקלות פעילות</h3>
                  <Button
                    variant="ghost"
                    size={isMobile ? 'md' : 'sm'}
                    onClick={() => {
                      window.location.href = `/tickets?project=${encodeURIComponent(project.project_code)}`
                    }}
                    style={isMobile ? { width: '100%', minHeight: 44 } : undefined}
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
                        style={{
                          ...styles.ticketItem,
                          ...styles.ticketItemButton,
                          ...(isMobile ? styles.ticketItemMobile : null),
                        }}
                        onClick={() => onOpenTicket(ticket.id)}
                      >
                        <span style={styles.ticketNumber}>#{ticket.ticket_number}</span>
                        <StatusBadge status={ticket.status} size="sm" />
                        <span style={styles.mutedMeta}>
                          {formatReporterNameAndPhone(ticket.reporter_name, ticket.reporter_phone) ||
                            '—'}
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
                            style={{
                              ...styles.ticketHistoryItem,
                              ...styles.ticketItemButton,
                              ...(isMobile ? styles.ticketItemMobile : null),
                            }}
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
                              {formatReporterNameAndPhone(
                                ticket.reporter_name,
                                ticket.reporter_phone
                              ) || '—'}
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
                        size={isMobile ? 'md' : 'sm'}
                        loading={exportingHistory}
                        onClick={() => onExportHistory(project)}
                        style={{ width: '100%', marginTop: 8, minHeight: isMobile ? 48 : undefined }}
                      >
                        ייצוא היסטוריה ל-Excel
                      </Button>
                    </>
                  )}
                </CollapsibleSection>
              </div>
            </div>
          ) : (
            body
          )}
        </div>
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
    overflow: 'hidden',
    overscrollBehavior: 'none',
  },
  overlayMobile: {
    padding: 0,
    alignItems: 'flex-end',
    justifyContent: 'stretch',
    width: '100%',
    maxWidth: '100%',
  },
  panel: {
    width: 'min(720px, calc(100vw - 48px))',
    maxWidth: '100%',
    minWidth: 0,
    height: 'min(680px, calc(100vh - 64px))',
    maxHeight: 'calc(100vh - 64px)',
    display: 'flex',
    flexDirection: 'column',
    background: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    border: `1px solid ${theme.colors.border}`,
    boxShadow: theme.shadows.xl,
    overflow: 'hidden',
    overflowX: 'clip',
    animation: 'hubModalIn 0.22s ease',
    transformOrigin: 'center center',
    boxSizing: 'border-box',
  },
  panelMobile: {
    width: '100%',
    maxWidth: '100%',
    height: 'auto',
    maxHeight: 'min(88dvh, 100svh)',
    borderRadius: '16px 16px 0 0',
    marginTop: 0,
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
  headerMobile: {
    padding: `${theme.spacing.md} ${theme.spacing.md} ${theme.spacing.sm}`,
    paddingTop: `calc(${theme.spacing.md} + env(safe-area-inset-top, 0px))`,
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
  titleMobile: {
    fontSize: theme.typography.fontSize.xl,
    wordBreak: 'break-word' as const,
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
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: theme.colors.border,
    background: theme.colors.surface,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    boxShadow: theme.shadows.xs,
    transition: `background ${theme.motion.fast} ease, border-color ${theme.motion.fast} ease, color ${theme.motion.fast} ease`,
  },
  closeButtonMobile: {
    width: 44,
    height: 44,
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
  tabBarMobile: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    // Single-row scrollable tabs (not 2×4 wrap) — still relative, never sticky.
    // Panel/body keep overflow-x: clip (#292); only the tab bar scrolls horizontally.
    overflowX: 'auto',
    overflowY: 'hidden',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorX: 'contain',
    position: 'relative' as const,
    zIndex: 1,
    flexShrink: 0,
    scrollbarWidth: 'none' as const,
  },
  tabTrack: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    width: '100%',
    padding: 4,
    borderRadius: theme.radius.lg,
    background: theme.colors.surfaceInset,
    boxSizing: 'border-box' as const,
  },
  tabTrackMobile: {
    display: 'flex',
    flexWrap: 'nowrap' as const,
    alignItems: 'stretch',
    gap: 4,
    width: 'max-content',
    minWidth: '100%',
  },
  tab: {
    flex: '1 1 0',
    minWidth: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    padding: '6px 8px',
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
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
  tabCompact: {
    flex: '0 0 auto',
    padding: '10px 12px',
    fontSize: theme.typography.fontSize.xs,
    minHeight: 44,
    minWidth: 72,
    whiteSpace: 'nowrap',
    textAlign: 'center' as const,
    borderRadius: theme.radius.md,
    lineHeight: 1.15,
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
    minWidth: 0,
    maxWidth: '100%',
    overflowX: 'clip',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    overscrollBehaviorX: 'none',
    touchAction: 'pan-y',
    padding: theme.spacing.xl,
    paddingBottom: `calc(${theme.spacing.xl} + env(safe-area-inset-bottom, 0px))`,
    background: theme.colors.background,
    boxSizing: 'border-box',
  },
  bodyMobile: {
    padding: theme.spacing.md,
    paddingBottom: `calc(${theme.spacing.lg} + env(safe-area-inset-bottom, 0px))`,
    WebkitOverflowScrolling: 'touch',
    overflowX: 'clip',
    maxWidth: '100%',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.xl,
    minWidth: 0,
    maxWidth: '100%',
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
  detailRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    minHeight: 0,
    padding: `${theme.spacing.md} ${theme.spacing.md}`,
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
    wordBreak: 'break-word' as const,
  },
  workerSelectWrap: {
    flex: 1,
    minWidth: 0,
    maxWidth: 280,
  },
  workerSelectWrapMobile: {
    maxWidth: '100%',
    width: '100%',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
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
  ticketItemMobile: {
    flexWrap: 'wrap' as const,
    minHeight: 48,
    alignItems: 'flex-start',
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
  settingsActions: {
    display: 'flex',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  settingsActionsMobile: {
    flexDirection: 'column',
  },
  settingsActionBtn: {
    flex: '1 1 160px',
    minWidth: 140,
  },
  settingsActionBtnMobile: {
    flex: '1 1 auto',
    minWidth: 0,
    width: '100%',
    minHeight: 48,
  },
}
