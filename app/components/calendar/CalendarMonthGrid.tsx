'use client'

import type { CSSProperties } from 'react'
import { theme } from '@/app/components/ui'
import {
  buildMonthGrid,
  dateKeyLocal,
  CALENDAR_EVENT_TYPE_COLORS,
  type CalendarEventType,
} from '@/lib/calendar-utils'
import { getIsMobileViewport } from '@/lib/shared/mobile-viewport'
import { useEffect, useState } from 'react'

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const MAX_CHIPS_DESKTOP = 3
const MAX_CHIPS_MOBILE = 0 // dots only on mobile

export type CalendarMonthChip = {
  id: string
  title: string
  event_type: string
}

type Props = {
  year: number
  month: number
  selectedDay: Date | null
  /** @deprecated prefer eventsByDay */
  eventCountByDay?: Map<string, number>
  eventsByDay?: Map<string, CalendarMonthChip[]>
  onSelectDay: (d: Date) => void
}

export function CalendarMonthGrid({
  year,
  month,
  selectedDay,
  eventCountByDay,
  eventsByDay,
  onSelectDay,
}: Props) {
  const cells = buildMonthGrid(year, month)
  const selectedKey = selectedDay ? dateKeyLocal(selectedDay) : null
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const maxChips = isMobile ? MAX_CHIPS_MOBILE : MAX_CHIPS_DESKTOP

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
          const dayEvents = eventsByDay?.get(key) || []
          const count =
            dayEvents.length > 0
              ? dayEvents.length
              : eventCountByDay?.get(key) || 0
          const isSelected = selectedKey === key
          const isToday = dateKeyLocal(new Date()) === key
          const shown = dayEvents.slice(0, maxChips)
          const more = dayEvents.length - shown.length

          return (
            <button
              key={key + String(inMonth)}
              type="button"
              onClick={() => onSelectDay(date)}
              style={{
                ...gridStyles.cell,
                ...(isMobile ? gridStyles.cellMobile : null),
                opacity: inMonth ? 1 : 0.4,
                borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                background: isSelected ? theme.colors.primaryMuted : theme.colors.surface,
                fontWeight: isToday ? 700 : 500,
              }}
            >
              <span style={gridStyles.dayNum}>{date.getDate()}</span>
              {dayEvents.length > 0 && maxChips === 0 ? (
                <div style={gridStyles.dots}>
                  {dayEvents.slice(0, 4).map((ev) => {
                    const et = (ev.event_type || 'other') as CalendarEventType
                    const color =
                      CALENDAR_EVENT_TYPE_COLORS[et] || CALENDAR_EVENT_TYPE_COLORS.other
                    return (
                      <span
                        key={ev.id}
                        style={{ ...gridStyles.dot, background: color }}
                        title={ev.title}
                      />
                    )
                  })}
                </div>
              ) : null}
              {shown.length > 0 ? (
                <div style={gridStyles.chips}>
                  {shown.map((ev) => {
                    const et = (ev.event_type || 'other') as CalendarEventType
                    const color =
                      CALENDAR_EVENT_TYPE_COLORS[et] || CALENDAR_EVENT_TYPE_COLORS.other
                    return (
                      <span
                        key={ev.id}
                        style={{ ...gridStyles.chip, background: color }}
                        title={ev.title}
                      >
                        {ev.title}
                      </span>
                    )
                  })}
                  {more > 0 ? <span style={gridStyles.more}>+{more}</span> : null}
                </div>
              ) : count > 0 && dayEvents.length === 0 ? (
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
    minHeight: '92px',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    background: theme.colors.surface,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    color: theme.colors.textPrimary,
    padding: '6px',
    overflow: 'hidden',
    textAlign: 'start',
  },
  cellMobile: {
    minHeight: '56px',
    alignItems: 'center',
    padding: '4px',
  },
  dayNum: {
    fontSize: '13px',
    lineHeight: 1.2,
    alignSelf: 'flex-start',
  },
  chips: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
    width: '100%',
  },
  chip: {
    display: 'block',
    fontSize: '10px',
    fontWeight: 600,
    color: '#fff',
    borderRadius: 3,
    padding: '1px 4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.35,
    maxWidth: '100%',
  },
  more: {
    fontSize: '10px',
    fontWeight: 700,
    color: theme.colors.textMuted,
    paddingInlineStart: 2,
  },
  dots: {
    display: 'flex',
    gap: 3,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    flexShrink: 0,
  },
  badge: {
    fontSize: '10px',
    fontWeight: 700,
    color: theme.colors.primary,
    background: theme.colors.primaryMuted,
    borderRadius: theme.radius.full,
    padding: '1px 6px',
    alignSelf: 'center',
  },
}
