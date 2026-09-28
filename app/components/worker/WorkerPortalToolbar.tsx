'use client'

import type { CSSProperties, ReactNode } from 'react'
import { theme } from '../ui'

export type WorkerTicketFilter = 'ALL' | 'NEW' | 'IN_TREATMENT'
export type WorkerPortalTab = 'TICKETS' | 'TOURS' | 'ATTENDANCE' | 'MAINTENANCE'

type WorkerPortalToolbarProps = {
  colors: typeof theme.colors
  portalTab: WorkerPortalTab
  filter: WorkerTicketFilter
  ticketCount: number
  filteredCount: number
  refreshing: boolean
  usingCache: boolean
  darkMode: boolean
  onPortalTabChange: (tab: WorkerPortalTab) => void
  onFilterChange: (f: WorkerTicketFilter) => void
  onRefresh: () => void
  onToggleDark: () => void
  onEnablePush?: () => void
  pushEnabling?: boolean
  /** תוסף חתמת עובדים — מציג לשונית נוכחות */
  showAttendanceTab?: boolean
}

const PORTAL_TABS: { id: WorkerPortalTab; label: string; icon: WorkerTabIcon }[] = [
  { id: 'TICKETS', label: 'תקלות', icon: 'ticket' },
  { id: 'MAINTENANCE', label: 'אחזקה', icon: 'wrench' },
  { id: 'TOURS', label: 'סיורים', icon: 'map' },
  { id: 'ATTENDANCE', label: 'שעות', icon: 'clock' },
]

const FILTERS: { id: WorkerTicketFilter; label: string }[] = [
  { id: 'ALL', label: 'הכל' },
  { id: 'NEW', label: 'חדש' },
  { id: 'IN_TREATMENT', label: 'בטיפול' },
]

type WorkerTabIcon = 'ticket' | 'wrench' | 'map' | 'clock'

function TabIcon({ type, active, color }: { type: WorkerTabIcon; active: boolean; color: string }) {
  const stroke = active ? theme.colors.primary : color
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: stroke,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (type === 'ticket') {
    return (
      <svg {...common}>
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
        <path d="M13 5v2M13 17v2M13 11v2" />
      </svg>
    )
  }
  if (type === 'wrench') {
    return (
      <svg {...common}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    )
  }
  if (type === 'map') {
    return (
      <svg {...common}>
        <path d="M14 7c0 2.2-1.8 4.5-2 5-.2-.5-2-2.8-2-5a2 2 0 1 1 4 0Z" />
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l3 2" />
    </svg>
  )
}

function ChromeIcon({
  kind,
  color,
}: {
  kind: 'bell' | 'sun' | 'moon' | 'refresh'
  color: string
}): ReactNode {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (kind === 'bell') {
    return (
      <svg {...common}>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    )
  }
  if (kind === 'sun') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }
  if (kind === 'moon') {
    return (
      <svg {...common}>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    )
  }
  return (
    <svg {...common} className={undefined}>
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

export function WorkerPortalToolbar({
  colors,
  portalTab,
  filter,
  ticketCount,
  filteredCount,
  refreshing,
  usingCache,
  darkMode,
  onPortalTabChange,
  onFilterChange,
  onRefresh,
  onToggleDark,
  onEnablePush,
  pushEnabling,
  showAttendanceTab = false,
}: WorkerPortalToolbarProps) {
  const tabs = showAttendanceTab
    ? PORTAL_TABS
    : PORTAL_TABS.filter((t) => t.id !== 'ATTENDANCE')

  const subtitle =
    portalTab === 'TOURS'
      ? 'רישום סיורים בפרויקטים'
      : portalTab === 'MAINTENANCE'
        ? 'משימות אחזקה להיום'
        : portalTab === 'ATTENDANCE'
          ? 'הצמידו את הטלפון למדבקה'
          : filteredCount === ticketCount
            ? `${ticketCount} תקלות פתוחות`
            : `${filteredCount} מתוך ${ticketCount}`

  return (
    <>
      <div className="lg-chrome" style={styles.chrome}>
        <div style={styles.chromeRow}>
          <span style={styles.count(colors)}>{subtitle}</span>
          <div style={styles.actions}>
            {onEnablePush ? (
              <button
                type="button"
                className="lg-glass"
                style={styles.iconBtn(colors)}
                onClick={onEnablePush}
                disabled={pushEnabling}
                aria-label="הפעל התראות"
              >
                <ChromeIcon kind="bell" color={colors.textSecondary} />
              </button>
            ) : null}
            <button
              type="button"
              className="lg-glass"
              style={styles.iconBtn(colors)}
              onClick={onToggleDark}
              aria-label={darkMode ? 'מצב בהיר' : 'מצב כהה'}
            >
              <ChromeIcon kind={darkMode ? 'sun' : 'moon'} color={colors.textSecondary} />
            </button>
            <button
              type="button"
              className="lg-glass"
              style={styles.iconBtn(colors)}
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="רענון"
            >
              <ChromeIcon kind="refresh" color={colors.textSecondary} />
            </button>
          </div>
        </div>

        {usingCache && portalTab === 'TICKETS' ? (
          <div className="lg-chip" style={styles.cacheBanner(colors)}>
            מציג נתונים שמורים — אין חיבור לרשת
          </div>
        ) : null}

        {portalTab === 'TICKETS' ? (
          <div style={styles.chips}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={filter === f.id ? 'lg-chip-active' : 'lg-chip'}
                style={styles.chip}
                onClick={() => onFilterChange(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <nav className="lg-tabbar" style={styles.tabbar} aria-label="ניווט אזור עובד">
        {tabs.map((t) => {
          const active = portalTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              className={active ? 'lg-nav-active' : undefined}
              style={{
                ...styles.tabItem,
                color: active ? theme.colors.primary : colors.textMuted,
              }}
              onClick={() => onPortalTabChange(t.id)}
              aria-current={active ? 'page' : undefined}
            >
              <span style={styles.tabIcon}>
                <TabIcon type={t.icon} active={active} color={colors.textMuted} />
              </span>
              <span style={styles.tabLabel}>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}

const styles = {
  chrome: {
    flexShrink: 0,
    paddingTop: '8px',
    paddingBottom: '10px',
    paddingInline: '14px',
    position: 'sticky',
    top: 0,
    zIndex: 40,
  } as CSSProperties,
  chromeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '8px',
  } as CSSProperties,
  count: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '13px',
    fontWeight: 600,
    color: c.textMuted,
    margin: 0,
    letterSpacing: '-0.01em',
  }),
  actions: {
    display: 'flex',
    gap: '8px',
  } as CSSProperties,
  iconBtn: (c: typeof theme.colors): CSSProperties => ({
    width: 48,
    height: 48,
    minWidth: 48,
    minHeight: 48,
    borderRadius: 14,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: c.textSecondary,
    padding: 0,
  }),
  cacheBanner: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '12px',
    fontWeight: 600,
    color: c.warning,
    padding: '8px 12px',
    borderRadius: 12,
    marginBottom: 8,
  }),
  chips: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  } as CSSProperties,
  chip: {
    padding: '10px 14px',
    minHeight: 44,
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  tabbar: {
    position: 'fixed',
    insetInline: 12,
    bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
    zIndex: 95,
    display: 'flex',
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    gap: 2,
    padding: '6px',
  } as CSSProperties,
  tabItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    border: 'none',
    background: 'transparent',
    borderRadius: 22,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: '4px 2px',
    transition: 'background 0.15s ease',
  } as CSSProperties,
  tabIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as CSSProperties,
  tabLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
  } as CSSProperties,
}
