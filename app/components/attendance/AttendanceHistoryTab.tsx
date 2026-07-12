'use client'

import { useCallback, useEffect, useMemo, useState, Fragment, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import {
  buildPastMonthOptions,
  currentMonthKey,
  formatAttendanceDateTime,
  formatShiftMinutes,
  monthBoundsFromKey,
  monthKeyFromIso,
  SHIFT_STATUS_HE,
  startOfCurrentMonth,
} from '@/lib/attendance-display'
import {
  groupShiftsByMonthAndWorker,
  type AttendanceHistoryMonthGroup,
  type AttendanceHistoryShift,
} from '@/lib/attendance-history'
import { Button, Card, EmptyState, SearchInput, Select, theme } from '../ui'
import { PageTransitionLoader } from '../page-skeleton'
import { AttendanceShiftEditForm } from './AttendanceShiftEditForm'
import { AttendanceShiftCreateForm } from './AttendanceShiftCreateForm'

type WorkerOpt = { id: string; full_name: string }

type HistoryScope = 'all' | 'month'

type AttendanceHistoryTabProps = {
  isMobile?: boolean
}

export function AttendanceHistoryTab({ isMobile = false }: AttendanceHistoryTabProps) {
  const pastMonthOptions = useMemo(() => buildPastMonthOptions(24), [])
  const [scope, setScope] = useState<HistoryScope>('all')
  const [monthKey, setMonthKey] = useState(pastMonthOptions[0]?.value ?? '')
  const [searchTerm, setSearchTerm] = useState('')
  const [shifts, setShifts] = useState<AttendanceHistoryShift[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [exportingMonthKey, setExportingMonthKey] = useState<string | null>(null)
  const [exportingAll, setExportingAll] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [workers, setWorkers] = useState<WorkerOpt[]>([])

  const range = useMemo(() => {
    const currentStart = startOfCurrentMonth()
    if (scope === 'month' && monthKey) {
      const bounds = monthBoundsFromKey(monthKey)
      if (!bounds) return null
      return {
        from: bounds.from,
        to: bounds.to,
        label: bounds.label,
      }
    }
    const oldest = pastMonthOptions[pastMonthOptions.length - 1]
    const oldestBounds = oldest ? monthBoundsFromKey(oldest.value) : null
    return {
      from: oldestBounds?.from ?? new Date(2024, 0, 1).toISOString(),
      to: currentStart.toISOString(),
      label: 'כל החודשים שעברו',
    }
  }, [scope, monthKey, pastMonthOptions])

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

  const load = useCallback(async () => {
    if (!range) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to })
      const res = await fetchWithTimeout(`/api/attendance/history?${params.toString()}`)
      const body = (await res.json().catch(() => ({}))) as {
        shifts?: AttendanceHistoryShift[]
        error?: string
      }
      if (!res.ok) throw new Error(body.error || 'טעינה נכשלה')
      setShifts(body.shifts ?? [])
      setLoaded(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת ההיסטוריה נכשלה')
      setShifts([])
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    void load()
  }, [load])

  const filteredShifts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return shifts
    return shifts.filter((s) => s.worker_name.toLowerCase().includes(q))
  }, [shifts, searchTerm])

  const historyByMonth = useMemo(
    () => groupShiftsByMonthAndWorker(filteredShifts),
    [filteredShifts]
  )

  async function exportMonthExcel(group: AttendanceHistoryMonthGroup) {
    setExportingMonthKey(group.monthKey)
    try {
      const { XLSXStyle: XLSX, applyHeaderStyle, applyDataStyles } = await import('@/lib/excel-style')

      const detailRows = group.workerGroups.flatMap((wg) =>
        wg.shifts.map((s) => ({
          עובד: wg.workerName,
          כניסה: formatAttendanceDateTime(s.started_at),
          יציאה: s.ended_at ? formatAttendanceDateTime(s.ended_at) : '—',
          'סה״כ שעות': formatShiftMinutes(s.total_minutes),
          סטטוס: SHIFT_STATUS_HE[s.status] ?? s.status,
        }))
      )

      const summaryRows = group.workerGroups.map((wg) => ({
        עובד: wg.workerName,
        'סה״כ שעות': formatShiftMinutes(wg.totalMinutes),
        'עלות משוערת': wg.estimatedCost > 0 ? wg.estimatedCost.toFixed(2) : '',
        משמרות: wg.shifts.length,
      }))

      const wsDetail = XLSX.utils.json_to_sheet(detailRows)
      applyHeaderStyle(wsDetail, 5)
      applyDataStyles(wsDetail, detailRows.length, 5)

      const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
      applyHeaderStyle(wsSummary, 4)
      applyDataStyles(wsSummary, summaryRows.length, 4)

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([{ חודש: group.label, הופק: new Date().toLocaleString('he-IL') }]),
        'מידע'
      )
      XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום עובדים')
      XLSX.utils.book_append_sheet(wb, wsDetail, 'משמרות')
      XLSX.writeFile(wb, `bamakor-attendance-${group.monthKey}.xlsx`)
      toast.success('הקובץ הורד')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ייצוא נכשל')
    } finally {
      setExportingMonthKey(null)
    }
  }

  async function exportAllExcel() {
    if (historyByMonth.length === 0) return
    setExportingAll(true)
    try {
      const { XLSXStyle: XLSX, applyHeaderStyle, applyDataStyles } = await import('@/lib/excel-style')

      const detailRows = filteredShifts.map((s) => ({
        חודש: monthBoundsFromKey(monthKeyFromIso(s.started_at))?.label ?? '',
        עובד: s.worker_name,
        כניסה: formatAttendanceDateTime(s.started_at),
        יציאה: s.ended_at ? formatAttendanceDateTime(s.ended_at) : '—',
        'סה״כ שעות': formatShiftMinutes(s.total_minutes),
        סטטוס: SHIFT_STATUS_HE[s.status] ?? s.status,
      }))

      const ws = XLSX.utils.json_to_sheet(detailRows)
      applyHeaderStyle(ws, 6)
      applyDataStyles(ws, detailRows.length, 6)

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([{ טווח: range?.label ?? '', הופק: new Date().toLocaleString('he-IL') }]),
        'מידע'
      )
      XLSX.utils.book_append_sheet(wb, ws, 'משמרות')
      XLSX.writeFile(wb, `bamakor-attendance-history-${currentMonthKey()}.xlsx`)
      toast.success('הקובץ הורד')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ייצוא נכשל')
    } finally {
      setExportingAll(false)
    }
  }

  const showSkeleton = loading && !loaded

  return (
    <Card noPadding>
      <div
        style={{
          ...styles.filtersRow,
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
        }}
      >
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="חיפוש לפי שם עובד…"
          style={{ flex: 1, maxWidth: isMobile ? 'none' : '280px', width: isMobile ? '100%' : undefined }}
        />
        <Select
          value={scope}
          onChange={(v) => setScope(v as HistoryScope)}
          options={[
            { label: 'כל החודשים שעברו', value: 'all' },
            { label: 'חודש ספציפי', value: 'month' },
          ]}
          style={{ minWidth: isMobile ? '100%' : '180px' }}
        />
        {scope === 'month' ? (
          <Select
            value={monthKey}
            onChange={setMonthKey}
            options={pastMonthOptions.map((o) => ({ label: o.label, value: o.value }))}
            style={{ minWidth: isMobile ? '100%' : '180px' }}
          />
        ) : null}
        {!isMobile ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setCreating(true)
              setEditingId(null)
            }}
            style={{ minHeight: '48px', flexShrink: 0 }}
          >
            הוסף משמרת
          </Button>
        ) : null}
        {!isMobile ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={filteredShifts.length === 0}
            loading={exportingAll}
            onClick={() => void exportAllExcel()}
            style={{ minHeight: '48px', flexShrink: 0 }}
          >
            ייצוא הכל
          </Button>
        ) : null}
      </div>

      {isMobile ? (
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button
            variant="secondary"
            onClick={() => {
              setCreating(true)
              setEditingId(null)
            }}
            style={{ width: '100%', minHeight: '48px' }}
          >
            הוסף משמרת
          </Button>
          <Button
            variant="secondary"
            disabled={filteredShifts.length === 0}
            loading={exportingAll}
            onClick={() => void exportAllExcel()}
            style={{ width: '100%', minHeight: '48px' }}
          >
            ייצוא הכל ({filteredShifts.length})
          </Button>
        </div>
      ) : null}

      {range ? (
        <p style={styles.rangeHint}>
          {range.label} · {filteredShifts.length} משמרות בארכיון
          {searchTerm.trim() ? ` · חיפוש: «${searchTerm.trim()}»` : ''}
          {' · '}עריכה, מחיקה והוספת משמרות ידנית
        </p>
      ) : null}

      {creating ? (
        <div style={styles.createPanel}>
          <AttendanceShiftCreateForm
            workers={workers}
            onCancel={() => setCreating(false)}
            onCreated={async () => {
              setCreating(false)
              await load()
            }}
            compact={isMobile}
          />
        </div>
      ) : null}

      {showSkeleton ? (
        <PageTransitionLoader />
      ) : !range ? (
        <EmptyState title="בחרו חודש" description="בחרו חודש מהרשימה כדי לצפות בארכיון." />
      ) : historyByMonth.length === 0 ? (
        <EmptyState
          title="אין משמרות בארכיון"
          description="משמרות מחודשים קודמים יופיעו כאן. החודש הנוכחי מוצג בלשונית «חודש נוכחי»."
        />
      ) : (
        <div style={styles.groups}>
          {historyByMonth.map((monthGroup) => (
            <MonthHistoryGroup
              key={monthGroup.monthKey}
              group={monthGroup}
              isMobile={isMobile}
              exporting={exportingMonthKey === monthGroup.monthKey}
              editingId={editingId}
              onEdit={(id) => {
                setCreating(false)
                setEditingId(id)
              }}
              onEditClose={() => setEditingId(null)}
              onShiftSaved={() => void load()}
              onExport={() => void exportMonthExcel(monthGroup)}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

function MonthHistoryGroup({
  group,
  isMobile,
  exporting,
  editingId,
  onEdit,
  onEditClose,
  onShiftSaved,
  onExport,
}: {
  group: AttendanceHistoryMonthGroup
  isMobile: boolean
  exporting: boolean
  editingId: string | null
  onEdit: (id: string) => void
  onEditClose: () => void
  onShiftSaved: () => void | Promise<void>
  onExport: () => void
}) {
  return (
    <div style={styles.group}>
      <div style={styles.groupHeader}>
        <div>
          <h3 style={styles.groupTitle}>{group.label}</h3>
          <p style={styles.groupMeta}>
            {group.shiftCount} משמרות · {formatShiftMinutes(group.totalMinutes)} סה״כ
          </p>
        </div>
        <Button variant="secondary" size="sm" loading={exporting} onClick={onExport} style={{ minHeight: '48px' }}>
          ייצוא
        </Button>
      </div>

      {group.workerGroups.map((workerGroup) => (
        <div key={workerGroup.workerId} style={styles.workerBlock}>
          <div style={styles.workerHeader}>
            <span style={styles.workerName}>{workerGroup.workerName}</span>
            <span style={styles.workerMeta}>
              {formatShiftMinutes(workerGroup.totalMinutes)}
              {workerGroup.estimatedCost > 0 ? ` · ₪${workerGroup.estimatedCost.toFixed(0)} משוער` : ''}
            </span>
          </div>

          {isMobile ? (
            <div style={styles.mobileList}>
              {workerGroup.shifts.map((shift) => (
                <div key={shift.id} style={styles.shiftCard}>
                  <div style={styles.shiftCardRow}>
                    <span>{formatAttendanceDateTime(shift.started_at)}</span>
                    <span style={styles.shiftHours}>{formatShiftMinutes(shift.total_minutes)}</span>
                  </div>
                  <div style={styles.shiftCardSub}>
                    יציאה: {shift.ended_at ? formatAttendanceDateTime(shift.ended_at) : '—'}
                    {' · '}
                    {SHIFT_STATUS_HE[shift.status] ?? shift.status}
                  </div>
                  {editingId === shift.id ? (
                    <div style={styles.mobileEdit}>
                      <AttendanceShiftEditForm
                        shift={shift}
                        compact
                        onCancel={onEditClose}
                        onSaved={async () => {
                          onEditClose()
                          await onShiftSaved()
                        }}
                        onDeleted={async () => {
                          onEditClose()
                          await onShiftSaved()
                        }}
                      />
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => onEdit(shift.id)} style={{ marginTop: 8 }}>
                      עריכה
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>כניסה</th>
                    <th style={styles.th}>יציאה</th>
                    <th style={styles.th}>שעות</th>
                    <th style={styles.th}>סטטוס</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {workerGroup.shifts.map((shift) => (
                    <Fragment key={shift.id}>
                      <tr>
                        <td style={styles.td}>{formatAttendanceDateTime(shift.started_at)}</td>
                        <td style={styles.td}>
                          {shift.ended_at ? formatAttendanceDateTime(shift.ended_at) : '—'}
                        </td>
                        <td style={styles.td}>{formatShiftMinutes(shift.total_minutes)}</td>
                        <td style={styles.td}>{SHIFT_STATUS_HE[shift.status] ?? shift.status}</td>
                        <td style={styles.td}>
                          <Button variant="ghost" size="sm" onClick={() => onEdit(shift.id)}>
                            עריכה
                          </Button>
                        </td>
                      </tr>
                      {editingId === shift.id ? (
                        <tr>
                          <td colSpan={5} style={styles.editCell}>
                            <AttendanceShiftEditForm
                              shift={shift}
                              onCancel={onEditClose}
                              onSaved={async () => {
                                onEditClose()
                                await onShiftSaved()
                              }}
                              onDeleted={async () => {
                                onEditClose()
                                await onShiftSaved()
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  filtersRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    borderBottom: `1px solid ${theme.colors.border}`,
    flexWrap: 'wrap',
  },
  rangeHint: {
    margin: '0 16px 8px',
    fontSize: '13px',
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  groups: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '16px',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  group: {
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    background: theme.colors.surface,
  },
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.muted,
    flexWrap: 'wrap',
  },
  groupTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  groupMeta: {
    margin: '4px 0 0',
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  workerBlock: {
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  workerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: theme.colors.surface,
    flexWrap: 'wrap',
  },
  workerName: {
    fontWeight: 600,
    fontSize: '14px',
    color: theme.colors.textPrimary,
  },
  workerMeta: {
    fontSize: '13px',
    color: theme.colors.primary,
    fontWeight: 600,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    textAlign: 'right',
    padding: '10px 20px',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.muted,
  },
  td: {
    padding: '12px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
    color: theme.colors.textPrimary,
  },
  mobileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '0 16px 16px',
  },
  shiftCard: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.background,
  },
  shiftCardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  shiftHours: {
    color: theme.colors.primary,
    flexShrink: 0,
  },
  shiftCardSub: {
    marginTop: '6px',
    fontSize: '12px',
    color: theme.colors.textMuted,
    lineHeight: 1.4,
  },
  mobileEdit: {
    marginTop: 10,
    padding: 10,
    borderRadius: theme.radius.md,
    background: theme.colors.primaryMuted,
  },
  editCell: {
    padding: '12px 20px',
    background: theme.colors.primaryMuted,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  createPanel: {
    margin: '0 16px 16px',
    padding: 14,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.primaryMuted,
  },
}
