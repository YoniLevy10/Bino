'use client'

import type { CSSProperties } from 'react'
import { theme } from '@/app/components/ui'
import { buildMonthGrid, dateKeyLocal } from '@/lib/calendar-utils'

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

type Props = {
  year: number
  month: number
  selectedDay: Date | null
  eventCountByDay: Map<string, number>
  onSelectDay: (d: Date) => void
}

export function CalendarMonthGrid({ year, month, selectedDay, eventCountByDay, onSelectDay }: Props) {
  const cells = buildMonthGrid(year, month)
  const selectedKey = selectedDay ? dateKeyLocal(selectedDay) : null

  return (
    <div>
      <div style={gridStyles.weekRow}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={gridStyles.weekday}>
            {w}
          </div>
        ))}
      </div>
      <div style={gridStyles.grid}>
        {cells.map(({ date, inMonth }) => {
          const key = dateKeyLocal(date)
          const count = eventCountByDay.get(key) || 0
          const isSelected = selectedKey === key
          const isToday = dateKeyLocal(new Date()) === key
          return (
            <button
              key={key + inMonth}
              type="button"
              onClick={() => onSelectDay(date)}
              style={{
                ...gridStyles.cell,
                opacity: inMonth ? 1 : 0.35,
                borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                background: isSelected ? theme.colors.primaryMuted : theme.colors.surface,
                fontWeight: isToday ? 700 : 500,
              }}
            >
              <span>{date.getDate()}</span>
              {count > 0 ? (
                <span style={gridStyles.badge}>{count}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const gridStyles: Record<string, CSSProperties> = {
  weekRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '4px',
    marginBottom: '4px',
  },
  weekday: {
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    padding: '4px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '4px',
  },
  cell: {
    minHeight: '52px',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    background: theme.colors.surface,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    cursor: 'pointer',
    fontSize: '14px',
    color: theme.colors.textPrimary,
    padding: '4px',
  },
  badge: {
    fontSize: '10px',
    fontWeight: 700,
    color: theme.colors.primary,
    background: theme.colors.primaryMuted,
    borderRadius: theme.radius.full,
    padding: '1px 6px',
  },
}
