'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import {
  decimalHoursToMinutes,
  minutesToDecimalHours,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
} from '@/lib/attendance-display'
import { Button, theme } from '../ui'

export type EditableAttendanceShift = {
  id: string
  started_at: string
  ended_at: string | null
  total_minutes: number | null
  admin_note?: string | null
}

type AttendanceShiftEditFormProps = {
  shift: EditableAttendanceShift
  onSaved: () => void | Promise<void>
  onCancel: () => void
  compact?: boolean
}

export function AttendanceShiftEditForm({
  shift,
  onSaved,
  onCancel,
  compact = false,
}: AttendanceShiftEditFormProps) {
  const [editStarted, setEditStarted] = useState('')
  const [editEnded, setEditEnded] = useState('')
  const [editHours, setEditHours] = useState('')
  const [editNote, setEditNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [hoursTouched, setHoursTouched] = useState(false)

  useEffect(() => {
    setEditStarted(toDatetimeLocalValue(shift.started_at))
    setEditEnded(shift.ended_at ? toDatetimeLocalValue(shift.ended_at) : '')
    setEditHours(minutesToDecimalHours(shift.total_minutes))
    setEditNote(shift.admin_note ?? '')
    setHoursTouched(false)
  }, [shift.id, shift.started_at, shift.ended_at, shift.total_minutes, shift.admin_note])

  function syncHoursFromTimes(started: string, ended: string) {
    if (!started || !ended) {
      setEditHours('')
      return
    }
    const mins = Math.round(
      (new Date(ended).getTime() - new Date(started).getTime()) / 60_000
    )
    if (mins >= 0) setEditHours(minutesToDecimalHours(mins))
  }

  function onStartedChange(value: string) {
    setEditStarted(value)
    setHoursTouched(false)
    if (value && editEnded) syncHoursFromTimes(value, editEnded)
  }

  function onEndedChange(value: string) {
    setEditEnded(value)
    setHoursTouched(false)
    if (editStarted && value) syncHoursFromTimes(editStarted, value)
  }

  function onHoursChange(value: string) {
    setEditHours(value)
    setHoursTouched(true)
    const mins = decimalHoursToMinutes(value)
    if (mins != null && editStarted) {
      const end = new Date(parseDatetimeLocalValue(editStarted))
      end.setMinutes(end.getMinutes() + mins)
      setEditEnded(toDatetimeLocalValue(end))
    }
  }

  async function saveEdit() {
    if (!editStarted) {
      toast.error('נדרש זמן כניסה')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        admin_note: editNote.trim() || null,
      }

      if (hoursTouched) {
        const mins = decimalHoursToMinutes(editHours)
        if (mins == null) throw new Error('שעות לא תקינות')
        body.started_at = parseDatetimeLocalValue(editStarted)
        body.total_minutes = mins
      } else {
        body.started_at = parseDatetimeLocalValue(editStarted)
        body.ended_at = editEnded ? parseDatetimeLocalValue(editEnded) : null
      }

      const res = await fetchWithTimeout(`/api/attendance/shifts/${shift.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const resBody = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(resBody.error || 'עדכון נכשל')
      toast.success('המשמרת עודכנה')
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'עדכון נכשל')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={compact ? styles.editRowCompact : styles.editRow}>
      <label style={styles.label}>
        כניסה
        <input
          type="datetime-local"
          value={editStarted}
          onChange={(e) => onStartedChange(e.target.value)}
          style={styles.input}
        />
      </label>
      <label style={styles.label}>
        יציאה
        <input
          type="datetime-local"
          value={editEnded}
          onChange={(e) => onEndedChange(e.target.value)}
          style={styles.input}
        />
      </label>
      <label style={styles.label}>
        סה״כ שעות
        <input
          type="number"
          min={0}
          max={24}
          step={0.25}
          value={editHours}
          onChange={(e) => onHoursChange(e.target.value)}
          placeholder="8.50"
          style={{ ...styles.input, width: 96 }}
        />
      </label>
      <label style={{ ...styles.label, flex: 1, minWidth: 140 }}>
        הערת מנהל
        <input value={editNote} onChange={(e) => setEditNote(e.target.value)} style={styles.input} />
      </label>
      <Button variant="primary" size="sm" loading={saving} onClick={() => void saveEdit()}>
        שמור
      </Button>
      <Button variant="secondary" size="sm" onClick={onCancel}>
        ביטול
      </Button>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  editRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'flex-end',
  },
  editRowCompact: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    alignItems: 'stretch',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: 600,
  },
  input: {
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    background: theme.colors.surface,
    minHeight: 40,
  },
}
