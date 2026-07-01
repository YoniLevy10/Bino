'use client'

import { useCallback, useEffect, useMemo, useState, Fragment, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import {
  buildMonthOptions,
  currentMonthKey,
  formatAttendanceDateTime,
  formatShiftMinutes,
  monthBounds,
  monthBoundsFromKey,
  SHIFT_STATUS_HE,
} from '@/lib/attendance-display'
import { Button, Card, theme } from '../ui'
import { PageListSkeleton } from '../page-skeleton'

type ShiftRow = {
  id: string
  worker_id: string
  started_at: string
  ended_at: string | null
  total_minutes: number | null
  status: string
  admin_note?: string | null
  workers?: { full_name?: string; hourly_rate?: number | null } | { full_name?: string; hourly_rate?: number | null }[] | null
}

type VisitRow = {
  id: string
  worker_id: string
  client_recorded_at: string
  tag_code: string | null
  event_type?: string
  workers?: { full_name?: string } | { full_name?: string }[] | null
  projects?: { name?: string } | { name?: string }[] | null
}

type WorkerOpt = { id: string; full_name: string }

function workerName(row: ShiftRow | VisitRow): string {
  const w = row.workers
  if (!w) return '—'
  if (Array.isArray(w)) return w[0]?.full_name ?? '—'
  return w.full_name ?? '—'
}

function workerHourlyRate(row: ShiftRow): number | null {
  const w = row.workers
  if (!w) return null
  const rate = Array.isArray(w) ? w[0]?.hourly_rate : w.hourly_rate
  return rate != null && Number.isFinite(Number(rate)) ? Number(rate) : null
}

function visitProject(row: VisitRow): string {
  const p = row.projects
  if (!p) return row.tag_code ?? '—'
  if (Array.isArray(p)) return p[0]?.name ?? '—'
  return p.name ?? '—'
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

type AttendanceShiftsReportProps = {
  /** When true — show only the current calendar month (resets automatically each month). */
  lockToCurrentMonth?: boolean
  /** From /api/attendance/dashboard — skip duplicate fetch when unfiltered. */
  prefetchedShifts?: ShiftRow[] | null
  prefetchedVisits?: VisitRow[] | null
  prefetchVersion?: number
}

export function AttendanceShiftsReport({
  lockToCurrentMonth = false,
  prefetchedShifts,
  prefetchedVisits,
  prefetchVersion = 0,
}: AttendanceShiftsReportProps) {
  const now = new Date()
  const [dateMode, setDateMode] = useState<'month' | 'range'>('month')
  const [monthKey, setMonthKey] = useState(currentMonthKey(now))
  const [fromDate, setFromDate] = useState(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [toDate, setToDate] = useState(toDateInput(now))
  const [workerId, setWorkerId] = useState('')
  const [workers, setWorkers] = useState<WorkerOpt[]>([])
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStarted, setEditStarted] = useState('')
  const [editEnded, setEditEnded] = useState('')
  const [editNote, setEditNote] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const monthOptions = buildMonthOptions()

  const { from, to, periodLabel } = useMemo(() => {
    if (lockToCurrentMonth) {
      const bounds = monthBounds(now.getFullYear(), now.getMonth())
      return { from: bounds.from, to: bounds.to, periodLabel: bounds.label }
    }
    if (dateMode === 'month') {
      const parsed = monthBoundsFromKey(monthKey)
      if (parsed) return { from: parsed.from, to: parsed.to, periodLabel: parsed.label }
      const [y, m] = monthKey.split('-').map(Number)
      const bounds = monthBounds(y, m - 1)
      return { from: bounds.from, to: bounds.to, periodLabel: bounds.label }
    }
    return {
      from: `${fromDate}T00:00:00.000Z`,
      to: `${toDate}T23:59:59.999Z`,
      periodLabel: `${fromDate} — ${toDate}`,
    }
  }, [lockToCurrentMonth, dateMode, monthKey, fromDate, toDate])

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('workers')
        .select('id, full_name')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('full_name')
      setWorkers((data as WorkerOpt[]) ?? [])
    })()
  }, [])

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      const canUsePrefetch =
        !opts?.force &&
        lockToCurrentMonth &&
        !workerId &&
        prefetchedShifts !== undefined &&
        prefetchedVisits !== undefined

      if (canUsePrefetch) {
        setShifts(prefetchedShifts ?? [])
        setVisits(prefetchedVisits ?? [])
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const params = new URLSearchParams({
          from,
          to,
          limit: '2000',
        })
        if (workerId) params.set('worker_id', workerId)

        const [shRes, evRes] = await Promise.all([
          fetchWithTimeout(`/api/attendance/shifts?${params.toString()}`),
          fetchWithTimeout(`/api/attendance/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=500`),
        ])

        const shBody = (await shRes.json().catch(() => ({}))) as { shifts?: ShiftRow[]; error?: string }
        if (!shRes.ok) throw new Error(shBody.error || 'טעינה נכשלה')
        setShifts(shBody.shifts ?? [])

        const evBody = (await evRes.json().catch(() => ({}))) as { events?: VisitRow[] }
        const allEvents = evBody.events ?? []
        setVisits(allEvents.filter((e) => e.event_type === 'project_visit'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
      } finally {
        setLoading(false)
      }
    },
    [from, to, workerId, lockToCurrentMonth, prefetchedShifts, prefetchedVisits]
  )

  useEffect(() => {
    void load({ force: !!workerId })
  }, [load, workerId, prefetchVersion])

  const workerSummaries = useMemo(() => {
    const map = new Map<string, { name: string; minutes: number; cost: number }>()
    for (const s of shifts) {
      const name = workerName(s)
      const mins = s.total_minutes ?? 0
      const rate = workerHourlyRate(s) ?? 0
      const prev = map.get(s.worker_id) ?? { name, minutes: 0, cost: 0 }
      map.set(s.worker_id, {
        name,
        minutes: prev.minutes + mins,
        cost: prev.cost + (mins / 60) * rate,
      })
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }, [shifts])

  function openEdit(row: ShiftRow) {
    setEditingId(row.id)
    setEditStarted(row.started_at.slice(0, 16))
    setEditEnded(row.ended_at ? row.ended_at.slice(0, 16) : '')
    setEditNote(row.admin_note ?? '')
  }

  async function saveEdit() {
    if (!editingId) return
    setSavingEdit(true)
    try {
      const res = await fetchWithTimeout(`/api/attendance/shifts/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          started_at: new Date(editStarted).toISOString(),
          ended_at: editEnded ? new Date(editEnded).toISOString() : null,
          admin_note: editNote.trim() || null,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'עדכון נכשל')
      toast.success('המשמרת עודכנה')
      setEditingId(null)
      await load({ force: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'עדכון נכשל')
    } finally {
      setSavingEdit(false)
    }
  }

  function printPdf() {
    const rows = shifts
      .map(
        (s) =>
          `<tr><td>${workerName(s)}</td><td>${formatAttendanceDateTime(s.started_at)}</td><td>${s.ended_at ? formatAttendanceDateTime(s.ended_at) : '—'}</td><td>${formatShiftMinutes(s.total_minutes)}</td><td>${SHIFT_STATUS_HE[s.status] ?? s.status}</td></tr>`
      )
      .join('')
    const summary = workerSummaries
      .map((w) => `<tr><td>${w.name}</td><td>${formatShiftMinutes(w.minutes)}</td></tr>`)
      .join('')
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>דוח שעות ${periodLabel}</title>
<style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#f3f4f6}</style></head>
<body><h1>דוח שעות עובדים</h1><p>${periodLabel}</p>
<h2>סיכום</h2><table><thead><tr><th>עובד</th><th>שעות</th></tr></thead><tbody>${summary}</tbody></table>
<h2>משמרות</h2><table><thead><tr><th>עובד</th><th>כניסה</th><th>יציאה</th><th>שעות</th><th>סטטוס</th></tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=function(){window.print()}</script></body></html>`
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
    }
  }

  function exportGreenInvoiceCsv() {
    const header = 'employee_name,hours,rate,amount,period_start,period_end\n'
    const lines = workerSummaries.map((w) => {
      const hours = (w.minutes / 60).toFixed(2)
      const rate = w.cost > 0 && w.minutes > 0 ? (w.cost / (w.minutes / 60)).toFixed(2) : '0'
      return `"${w.name}",${hours},${rate},${w.cost.toFixed(2)},${fromDate || monthKey + '-01'},${toDate || monthKey + '-28'}`
    })
    const blob = new Blob([header + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `green-invoice-hours-${monthKey || fromDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('קובץ Green Invoice הורד')
  }

  async function exportExcel() {
    setExporting(true)
    try {
      const { XLSXStyle: XLSX, applyHeaderStyle, applyDataStyles } = await import('@/lib/excel-style')

      const detailRows = shifts.map((s) => {
        const rate = workerHourlyRate(s)
        const cost =
          rate != null && s.total_minutes != null ? ((s.total_minutes / 60) * rate).toFixed(2) : ''
        return {
          עובד: workerName(s),
          תאריך: formatAttendanceDateTime(s.started_at).split(',')[0] ?? formatAttendanceDateTime(s.started_at),
          כניסה: formatAttendanceDateTime(s.started_at),
          יציאה: s.ended_at ? formatAttendanceDateTime(s.ended_at) : '—',
          'סה״כ שעות': formatShiftMinutes(s.total_minutes),
          דקות: s.total_minutes ?? '',
          'תעריף שעה': rate ?? '',
          'עלות משוערת': cost,
          סטטוס: SHIFT_STATUS_HE[s.status] ?? s.status,
        }
      })

      const summaryRows = workerSummaries.map((w) => ({
        עובד: w.name,
        'סה״כ שעות': formatShiftMinutes(w.minutes),
        דקות: w.minutes,
        'עלות משוערת': w.cost > 0 ? w.cost.toFixed(2) : '',
      }))

      const visitRows = visits.map((v) => ({
        עובד: workerName(v),
        בניין: visitProject(v),
        תאריך: formatAttendanceDateTime(v.client_recorded_at),
        תג: v.tag_code ?? '',
      }))

      const wsDetail = XLSX.utils.json_to_sheet(detailRows)
      wsDetail['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 16 }]
      applyHeaderStyle(wsDetail, 9)
      applyDataStyles(wsDetail, detailRows.length, 9)

      const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
      wsSummary['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 8 }, { wch: 12 }]
      applyHeaderStyle(wsSummary, 4)
      applyDataStyles(wsSummary, summaryRows.length, 4)

      const wsVisits = XLSX.utils.json_to_sheet(visitRows)
      wsVisits['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 10 }]
      applyHeaderStyle(wsVisits, 4)
      applyDataStyles(wsVisits, visitRows.length, 4)

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([{ תקופה: periodLabel, הופק: new Date().toLocaleString('he-IL') }]),
        'מידע'
      )
      XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום עובדים')
      XLSX.utils.book_append_sheet(wb, wsDetail, 'משמרות')
      XLSX.utils.book_append_sheet(wb, wsVisits, 'ביקורים')

      XLSX.writeFile(wb, `bamakor-shifts-${monthKey || fromDate}.xlsx`)
      toast.success('הקובץ הורד')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ייצוא נכשל')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={styles.sectionTitle}>דוח שעות — חודש נוכחי</h3>
      <p style={styles.hint}>
        {lockToCurrentMonth
          ? `מציג את ${periodLabel} בלבד. בתחילת כל חודש הנתונים עוברים אוטומטית ללשונית «היסטוריה».`
          : 'סינון לפי עובד ותקופה. ניתן לערוך משמרות, להוריד Excel/PDF או CSV ל-Green Invoice.'}
      </p>

      {workerSummaries.length > 0 ? (
        <div style={styles.summaryCards}>
          {workerSummaries.map((w) => (
            <div key={w.name} style={styles.summaryCard}>
              <div style={styles.summaryName}>{w.name}</div>
              <div style={styles.summaryHours}>{formatShiftMinutes(w.minutes)}</div>
              {w.cost > 0 ? <div style={styles.summaryCost}>₪{w.cost.toFixed(0)} משוער</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div style={styles.toolbar}>
        {!lockToCurrentMonth ? (
          <>
            <select style={styles.select} value={dateMode} onChange={(e) => setDateMode(e.target.value as 'month' | 'range')}>
              <option value="month">לפי חודש</option>
              <option value="range">טווח תאריכים</option>
            </select>

            {dateMode === 'month' ? (
              <select style={styles.select} value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input type="date" style={styles.select} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <span>—</span>
                <input type="date" style={styles.select} value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </>
            )}
          </>
        ) : (
          <span style={styles.periodBadge}>{periodLabel}</span>
        )}

        <select style={styles.select} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
          <option value="">כל העובדים</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.full_name}
            </option>
          ))}
        </select>

        <Button variant="primary" size="sm" loading={exporting} onClick={() => void exportExcel()}>
          Excel
        </Button>
        <Button variant="secondary" size="sm" onClick={printPdf}>
          PDF / הדפסה
        </Button>
        <Button variant="secondary" size="sm" onClick={exportGreenInvoiceCsv}>
          Green Invoice CSV
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void load({ force: true })}>
          רענון
        </Button>
      </div>

      {loading ? (
        <PageListSkeleton rows={5} />
      ) : shifts.length === 0 ? (
        <p style={styles.hint}>אין משמרות בתקופה — עדיין לא נרשמו כניסות/יציאות.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>עובד</th>
                <th style={styles.th}>כניסה</th>
                <th style={styles.th}>יציאה</th>
                <th style={styles.th}>שעות</th>
                <th style={styles.th}>סטטוס</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td style={styles.td}>{workerName(row)}</td>
                    <td style={styles.td}>{formatAttendanceDateTime(row.started_at)}</td>
                    <td style={styles.td}>{row.ended_at ? formatAttendanceDateTime(row.ended_at) : '—'}</td>
                    <td style={styles.td}>{formatShiftMinutes(row.total_minutes)}</td>
                    <td style={styles.td}>{SHIFT_STATUS_HE[row.status] ?? row.status}</td>
                    <td style={styles.td}>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                        עריכה
                      </Button>
                    </td>
                  </tr>
                  {editingId === row.id ? (
                    <tr key={`${row.id}-edit`}>
                      <td colSpan={6} style={styles.editCell}>
                        <div style={styles.editRow}>
                          <label>
                            כניסה
                            <input type="datetime-local" value={editStarted} onChange={(e) => setEditStarted(e.target.value)} style={styles.select} />
                          </label>
                          <label>
                            יציאה
                            <input type="datetime-local" value={editEnded} onChange={(e) => setEditEnded(e.target.value)} style={styles.select} />
                          </label>
                          <label>
                            הערה
                            <input value={editNote} onChange={(e) => setEditNote(e.target.value)} style={styles.select} />
                          </label>
                          <Button variant="primary" size="sm" loading={savingEdit} onClick={() => void saveEdit()}>
                            שמור
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                            ביטול
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  sectionTitle: { margin: '0 0 8px', fontSize: 16, fontWeight: 600 },
  hint: { margin: '0 0 12px', fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.5 },
  summaryCards: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.background,
    minWidth: 120,
  },
  summaryName: { fontWeight: 600, fontSize: 13, marginBottom: 4 },
  summaryHours: { fontSize: 18, fontWeight: 700, color: theme.colors.primary },
  summaryCost: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  select: {
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    background: theme.colors.surface,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'right',
    padding: '10px 12px',
    borderBottom: `2px solid ${theme.colors.border}`,
    color: theme.colors.textMuted,
    fontWeight: 600,
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  editCell: { background: theme.colors.primaryMuted, padding: 12 },
  editRow: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' },
  periodBadge: {
    padding: '8px 14px',
    borderRadius: 8,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
    fontWeight: 700,
    fontSize: 14,
  },
}
