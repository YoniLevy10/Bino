/** Derive ILS cost from worker hourly rate × minutes. */
export function costIlsFromMinutes(
  hourlyRate: number | null | undefined,
  minutes: number | null | undefined
): number | null {
  if (hourlyRate == null || minutes == null) return null
  if (!(hourlyRate > 0) || !(minutes > 0)) return null
  return Math.round((hourlyRate * (minutes / 60)) * 100) / 100
}
