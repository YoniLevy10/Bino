import { formatShiftMinutes, monthBoundsFromKey, monthKeyFromIso } from '@/lib/attendance-display'

export type AttendanceHistoryShift = {
  id: string
  worker_id: string
  worker_name: string
  hourly_rate: number | null
  started_at: string
  ended_at: string | null
  total_minutes: number | null
  status: string
}

export type AttendanceHistoryWorkerGroup = {
  workerId: string
  workerName: string
  totalMinutes: number
  estimatedCost: number
  shifts: AttendanceHistoryShift[]
}

export type AttendanceHistoryMonthGroup = {
  monthKey: string
  label: string
  totalMinutes: number
  workerGroups: AttendanceHistoryWorkerGroup[]
  shiftCount: number
}

function shiftCost(minutes: number, hourlyRate: number | null): number {
  if (hourlyRate == null || !Number.isFinite(hourlyRate) || minutes <= 0) return 0
  return (minutes / 60) * hourlyRate
}

export function groupShiftsByMonthAndWorker(shifts: AttendanceHistoryShift[]): AttendanceHistoryMonthGroup[] {
  const monthMap = new Map<string, Map<string, AttendanceHistoryWorkerGroup>>()

  for (const shift of shifts) {
    const monthKey = monthKeyFromIso(shift.started_at)
    const bounds = monthBoundsFromKey(monthKey)
    const monthLabel = bounds?.label ?? monthKey

    let workers = monthMap.get(monthKey)
    if (!workers) {
      workers = new Map()
      monthMap.set(monthKey, workers)
    }

    const mins = shift.total_minutes ?? 0
    const existing = workers.get(shift.worker_id)
    if (existing) {
      existing.shifts.push(shift)
      existing.totalMinutes += mins
      existing.estimatedCost += shiftCost(mins, shift.hourly_rate)
    } else {
      workers.set(shift.worker_id, {
        workerId: shift.worker_id,
        workerName: shift.worker_name,
        totalMinutes: mins,
        estimatedCost: shiftCost(mins, shift.hourly_rate),
        shifts: [shift],
      })
    }

    // ensure label stored on first pass — use bounds from any shift in month
    void monthLabel
  }

  const months: AttendanceHistoryMonthGroup[] = []

  for (const [monthKey, workers] of monthMap) {
    const bounds = monthBoundsFromKey(monthKey)
    const workerGroups = Array.from(workers.values())
      .map((g) => ({
        ...g,
        shifts: [...g.shifts].sort(
          (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        ),
      }))
      .sort((a, b) => a.workerName.localeCompare(b.workerName, 'he'))

    const totalMinutes = workerGroups.reduce((sum, g) => sum + g.totalMinutes, 0)
    const shiftCount = workerGroups.reduce((sum, g) => sum + g.shifts.length, 0)

    months.push({
      monthKey,
      label: bounds?.label ?? monthKey,
      totalMinutes,
      workerGroups,
      shiftCount,
    })
  }

  return months.sort((a, b) => b.monthKey.localeCompare(a.monthKey))
}

export function formatMonthTotalHours(totalMinutes: number): string {
  return formatShiftMinutes(totalMinutes)
}
