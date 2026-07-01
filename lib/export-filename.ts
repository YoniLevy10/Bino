const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g

/** Safe segment for download filenames (Windows + mobile). Keeps Hebrew and spaces as hyphens. */
export function sanitizeExportFilenameSegment(label: string, fallback = 'export'): string {
  const trimmed = (label || '').trim()
  if (!trimmed) return fallback
  return trimmed
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback
}

export function exportDateSuffix(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function ticketHistoryExportFilename(projectName: string, date = new Date()): string {
  const safe = sanitizeExportFilenameSegment(projectName, 'project')
  return `bamakor-history-${safe}-${exportDateSuffix(date)}.xlsx`
}

export function ticketsListExportFilename(options?: {
  projectName?: string | null
  date?: Date
}): string {
  const day = exportDateSuffix(options?.date ?? new Date())
  const project = options?.projectName?.trim()
  if (project) {
    const safe = sanitizeExportFilenameSegment(project)
    return `bamakor-tickets-${safe}-${day}.xlsx`
  }
  return `bamakor-tickets-${day}.xlsx`
}

export function summaryProjectExportFilename(projectName: string, periodSuffix: string): string {
  const safe = sanitizeExportFilenameSegment(projectName, 'project')
  return `summary-${safe}-${periodSuffix}.xlsx`
}
