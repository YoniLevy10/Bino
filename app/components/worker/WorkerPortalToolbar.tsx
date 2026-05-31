'use client'

import type { CSSProperties } from 'react'
import type { theme } from '../ui'

export type WorkerTicketFilter = 'ALL' | 'NEW' | 'IN_TREATMENT'

type WorkerPortalToolbarProps = {
  colors: typeof theme.colors
  filter: WorkerTicketFilter
  ticketCount: number
  filteredCount: number
  refreshing: boolean
  usingCache: boolean
  darkMode: boolean
  onFilterChange: (f: WorkerTicketFilter) => void
  onRefresh: () => void
  onToggleDark: () => void
  onEnablePush?: () => void
  pushEnabling?: boolean
}

const FILTERS: { id: WorkerTicketFilter; label: string }[] = [
  { id: 'ALL', label: 'הכל' },
  { id: 'NEW', label: 'חדש' },
  { id: 'IN_TREATMENT', label: 'בטיפול' },
]

export function WorkerPortalToolbar({
  colors,
  filter,
  ticketCount,
  filteredCount,
  refreshing,
  usingCache,
  darkMode,
  onFilterChange,
  onRefresh,
  onToggleDark,
  onEnablePush,
  pushEnabling,
}: WorkerPortalToolbarProps) {
  return (
    <div style={styles.wrap(colors)}>
      <div style={styles.row}>
        <span style={styles.count(colors)}>
          {filteredCount === ticketCount
            ? `${ticketCount} תקלות פתוחות`
            : `${filteredCount} מתוך ${ticketCount}`}
        </span>
        <div style={styles.actions}>
          {onEnablePush ? (
            <button
              type="button"
              style={styles.iconBtn(colors)}
              onClick={onEnablePush}
              disabled={pushEnabling}
              aria-label="הפעל התראות"
              title="התראות על תקלות חדשות"
            >
              {pushEnabling ? '…' : '🔔'}
            </button>
          ) : null}
          <button
            type="button"
            style={styles.iconBtn(colors)}
            onClick={onToggleDark}
            aria-label={darkMode ? 'מצב בהיר' : 'מצב כהה'}
            title={darkMode ? 'מצב בהיר' : 'מצב כהה'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button
            type="button"
            style={styles.iconBtn(colors)}
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="רענון"
            title="רענון"
          >
            {refreshing ? '…' : '↻'}
          </button>
        </div>
      </div>

      {usingCache ? (
        <div style={styles.cacheBanner(colors)}>מציג נתונים שמורים — אין חיבור לרשת</div>
      ) : null}

      <div style={styles.chips}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            style={filter === f.id ? styles.chipActive(colors) : styles.chip(colors)}
            onClick={() => onFilterChange(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const styles = {
  wrap: (c: typeof theme.colors): CSSProperties => ({
    flexShrink: 0,
    padding: '8px 14px 6px',
    borderBottom: `1px solid ${c.border}`,
    background: c.surface,
  }),
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '8px',
  } as CSSProperties,
  count: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '12px',
    color: c.textMuted,
    margin: 0,
  }),
  actions: {
    display: 'flex',
    gap: '4px',
  } as CSSProperties,
  iconBtn: (c: typeof theme.colors): CSSProperties => ({
    background: c.muted,
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    width: '34px',
    height: '34px',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  cacheBanner: (c: typeof theme.colors): CSSProperties => ({
    fontSize: '11px',
    color: c.warning,
    background: c.warningMuted,
    padding: '6px 10px',
    borderRadius: '8px',
    marginBottom: '8px',
  }),
  chips: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  } as CSSProperties,
  chip: (c: typeof theme.colors): CSSProperties => ({
    padding: '6px 12px',
    borderRadius: '999px',
    border: `1px solid ${c.border}`,
    background: c.muted,
    color: c.textSecondary,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  }),
  chipActive: (c: typeof theme.colors): CSSProperties => ({
    padding: '6px 12px',
    borderRadius: '999px',
    border: `1px solid ${c.primary}`,
    background: c.primaryMuted,
    color: c.primary,
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  }),
}
