'use client'

import type { CSSProperties } from 'react'
import type { InboxBuildingOption, InboxListFilters } from '@/lib/whatsapp/whatsapp-inbox-hooks'

type Props = {
  filters: InboxListFilters
  buildingOptions: InboxBuildingOption[]
  onChange: (next: InboxListFilters) => void
}

const STATUS_OPTIONS: { value: InboxListFilters['status']; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'awaiting_reply', label: 'מחכה לתגובה' },
  { value: 'open_ticket', label: 'תקלה פתוחה' },
  { value: 'session_open', label: 'חלון פעיל' },
  { value: 'session_closed', label: 'חלון סגור' },
]

export function WhatsAppInboxFilters({ filters, buildingOptions, onChange }: Props) {
  return (
    <div style={styles.row} aria-label="סינון שיחות">
      <label style={styles.field}>
        <span style={styles.label}>בניין</span>
        <select
          value={filters.buildingId ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              buildingId: e.target.value || null,
            })
          }
          style={styles.select}
        >
          <option value="">כל הבניינים</option>
          {buildingOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label style={styles.field}>
        <span style={styles.label}>סטטוס</span>
        <select
          value={filters.status}
          onChange={(e) =>
            onChange({
              ...filters,
              status: e.target.value as InboxListFilters['status'],
            })
          }
          style={styles.select}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label style={styles.check}>
        <input
          type="checkbox"
          checked={filters.unreadOnly}
          onChange={(e) => onChange({ ...filters, unreadOnly: e.target.checked })}
        />
        <span>לא נקראו</span>
      </label>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
    alignItems: 'flex-end',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: '1 1 120px',
    minWidth: 110,
  },
  label: { fontSize: 11, fontWeight: 600, color: '#667781' },
  select: {
    border: 'none',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 16,
    background: '#f0f2f5',
    fontFamily: 'inherit',
    minHeight: 44,
  },
  check: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: '#111b21',
    paddingBottom: 8,
    cursor: 'pointer',
    userSelect: 'none',
  },
}