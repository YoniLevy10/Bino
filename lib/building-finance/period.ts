/**
 * Building-finance period keys: YYYY | YYYY-Qn | YYYY-MM
 * Matches DB CHECK on building_budgets.period_key.
 */

export type FinancePeriodGranularity = 'year' | 'quarter' | 'month'

export type FinancePeriodRange = {
  period_key: string
  granularity: FinancePeriodGranularity
  start_date: string
  end_date: string
  label_he: string
  /** 0–1 progress through the period (clamped). */
  elapsed_fraction: number
  previous_period_key: string
}

const PERIOD_KEY_RE = /^(\d{4})(?:-Q([1-4])|-(\d{2}))?$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(y: number, month1to12: number, day: number): string {
  return `${y}-${pad2(month1to12)}-${pad2(day)}`
}

function daysInMonth(y: number, month1to12: number): number {
  return new Date(Date.UTC(y, month1to12, 0)).getUTCDate()
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Elapsed fraction for [start, endExclusive) in UTC calendar days. */
export function periodElapsedFraction(
  startDate: string,
  endDateInclusive: string,
  now = new Date()
): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`)
  const endExclusive = Date.parse(`${endDateInclusive}T00:00:00.000Z`) + 24 * 60 * 60 * 1000
  if (!Number.isFinite(start) || !Number.isFinite(endExclusive) || endExclusive <= start) {
    return 0
  }
  const t = now.getTime()
  return clamp01((t - start) / (endExclusive - start))
}

export function parsePeriodKey(periodKey: string): {
  year: number
  granularity: FinancePeriodGranularity
  quarter?: number
  month?: number
} | null {
  const m = PERIOD_KEY_RE.exec(periodKey.trim())
  if (!m) return null
  const year = Number(m[1])
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null
  if (m[2]) {
    return { year, granularity: 'quarter', quarter: Number(m[2]) }
  }
  if (m[3]) {
    const month = Number(m[3])
    if (month < 1 || month > 12) return null
    return { year, granularity: 'month', month }
  }
  return { year, granularity: 'year' }
}

export function buildPeriodRange(periodKey: string, now = new Date()): FinancePeriodRange | null {
  const parsed = parsePeriodKey(periodKey)
  if (!parsed) return null

  if (parsed.granularity === 'year') {
    const start_date = isoDate(parsed.year, 1, 1)
    const end_date = isoDate(parsed.year, 12, 31)
    return {
      period_key: String(parsed.year),
      granularity: 'year',
      start_date,
      end_date,
      label_he: `שנת ${parsed.year}`,
      elapsed_fraction: periodElapsedFraction(start_date, end_date, now),
      previous_period_key: String(parsed.year - 1),
    }
  }

  if (parsed.granularity === 'quarter' && parsed.quarter) {
    const q = parsed.quarter
    const startMonth = (q - 1) * 3 + 1
    const endMonth = startMonth + 2
    const start_date = isoDate(parsed.year, startMonth, 1)
    const end_date = isoDate(parsed.year, endMonth, daysInMonth(parsed.year, endMonth))
    const prevQ = q === 1 ? 4 : q - 1
    const prevY = q === 1 ? parsed.year - 1 : parsed.year
    return {
      period_key: `${parsed.year}-Q${q}`,
      granularity: 'quarter',
      start_date,
      end_date,
      label_he: `רבעון ${q} · ${parsed.year}`,
      elapsed_fraction: periodElapsedFraction(start_date, end_date, now),
      previous_period_key: `${prevY}-Q${prevQ}`,
    }
  }

  const month = parsed.month!
  const start_date = isoDate(parsed.year, month, 1)
  const end_date = isoDate(parsed.year, month, daysInMonth(parsed.year, month))
  const prevMonth = month === 1 ? 12 : month - 1
  const prevY = month === 1 ? parsed.year - 1 : parsed.year
  return {
    period_key: `${parsed.year}-${pad2(month)}`,
    granularity: 'month',
    start_date,
    end_date,
    label_he: `${pad2(month)}/${parsed.year}`,
    elapsed_fraction: periodElapsedFraction(start_date, end_date, now),
    previous_period_key: `${prevY}-${pad2(prevMonth)}`,
  }
}

export function defaultPeriodKey(
  granularity: FinancePeriodGranularity,
  now = new Date()
): string {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  if (granularity === 'year') return String(y)
  if (granularity === 'month') return `${y}-${pad2(m)}`
  const q = Math.ceil(m / 3)
  return `${y}-Q${q}`
}

/**
 * Resolve planned amount for a reporting period.
 * Prefer exact period budget; else scale annual building budget.
 */
export function resolvePlannedForPeriod(opts: {
  period: FinancePeriodRange
  exactPeriodPlanned: number | null
  annualPlanned: number | null
}): { planned: number; planned_source: 'exact' | 'annual_prorata' | 'none' } {
  if (opts.exactPeriodPlanned != null && opts.exactPeriodPlanned >= 0) {
    return { planned: opts.exactPeriodPlanned, planned_source: 'exact' }
  }
  const annual = opts.annualPlanned
  if (annual == null || annual < 0) {
    return { planned: 0, planned_source: 'none' }
  }
  if (opts.period.granularity === 'year') {
    return { planned: annual, planned_source: 'exact' }
  }
  if (opts.period.granularity === 'quarter') {
    return { planned: annual / 4, planned_source: 'annual_prorata' }
  }
  return { planned: annual / 12, planned_source: 'annual_prorata' }
}
