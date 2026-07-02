'use client'

import { useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import {
  decimalHoursToMinutes,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
} from '@/lib/attendance-display'
import { Button, theme } from '../ui'

type WorkerOpt = { id: string; full_name: string }

type AttendanceShiftCreateFormProps = {
  workers: WorkerOpt[]
  defaultWorkerId?: string
  onCreated: () => void | Promise<void>
  onCancel: () => void
  compact?: boolean
}

export function AttendanceShiftCreateForm({
  workers,
  defaultWorkerId = '',
  onCreated,
  onCancel,
  compact = false,
}: AttendanceShiftCreateFormProps) {
  const now = new Date()
  const defaultStart = toDatetimeLocalValue(now)
  const defaultEnd = toDatetimeLocalValue(new Date(now.getTime() + 8 * 3_600_000))

  const [workerId, setWorkerId] = useState(defaultWorkerId || workers[0]?.id || '')
  const [started, setStarted] = useState(defaultStart)
  const [ended, setEnded] = useState(defaultEnd)
  const [hours, setHours] = useState('8.00')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [hoursTouched, setHoursTouched] = useState(false)

  function onHoursChange(value: string) {
    setHours(value)
    setHoursTouched(true)
    const mins = decimalHoursToMinutes(value)
    if (mins != null && started) {
      const end = new Date(parseDatetimeLocalValue(started))
      end.setMinutes(end.getMinutes() + mins)
      setEnded(toDatetimeLocalValue(end))
    }
  }

  async function createShift() {
    if (!workerId) {
      toast.error('בחרו עובד')
      return
    }
    if (!started) {
      toast.error('נדרש זמן כניסה')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        worker_id: workerId,
        admin_note: note.trim() || null,
      }

      if (hoursTouched) {
        const mins = decimalHoursToMinutes(hours)
        if (mins == null) throw new Error('שעות לא תקינות')
        body.started_at = parseDatetimeLocalValue(started)
        body.total_minutes = mins
      } else {
        body.started_at = parseDatetimeLocalValue(started)
        body.ended_at = ended ? parseDatetimeLocalValue(ended) : null
      }

      const res = await fetchWithTimeout('/api/attendance/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const resBody = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(resBody.error || 'יצירה נכשלה')
      toast.success('המשמרת נוספה')
      await onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'יצירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={compact ? styles.col : styles.row}>
      <p style={styles.title}>הוספת משמרת ידנית</p>
      <label style={styles.label}>
        עובד
        <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} style={styles.input}>
          <option value="">בחרו עובד</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.full_name}
            </option>
          ))}
        </select>
      </label>
      <label style={styles.label}>
        כניסה
        <input
          type="datetime-local"
          value={started}
          onChange={(e) => setStarted(e.target.value)}
          style={styles.input}
        />
      </label>
      <label style={styles.label}>
        יציאה
        <input
          type="datetime-local"
          value={ended}
          onChange={(e) => {
            setEnded(e.target.value)
            setHoursTouched(false)
          }}
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
          value={hours}
          onChange={(e) => onHoursChange(e.target.value)}
          style={{ ...styles.input, width: 96 }}
        />
      </label>
      <label style={{ ...styles.label, flex: 1, minWidth: 140 }}>
        הערה
        <input value={note} onChange={(e) => setNote(e.target.value)} style={styles.input} />
      </label>
      <div style={styles.actions}>
        <Button variant="primary" size="sm" loading={saving} onClick={() => void createShift()}>
          הוסף משמרת
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'flex-end',
  },
  col: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    alignItems: 'stretch',
  },
  title: {
    margin: 0,
    width: '100%',
    fontSize: 14,
    fontWeight: 700,
    color: theme.colors.textPrimary,
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
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
}
