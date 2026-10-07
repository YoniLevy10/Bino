import {
  addJsonSheet,
  createWorkbook,
  downloadExcelWorkbook,
} from '@/lib/excel-workbook'
import { formatReporterNameAndPhone } from '@/lib/reporter-display'
import { ticketHistoryExportFilename } from '@/lib/export-filename'

export type ClosedTicketExportRow = {
  id: string
  ticket_number: number
  status?: string | null
  priority?: string | null
  description?: string | null
  created_at?: string | null
  closed_at?: string | null
  building_number?: string | null
  reporter_phone?: string | null
  reporter_name?: string | null
  worker_name?: string | null
}

const PRIORITY_LABEL_HE: Record<string, string> = {
  URGENT: 'דחופה',
  HIGH: 'גבוהה',
  MEDIUM: 'בינונית',
  LOW: 'נמוכה',
}

export function buildClosedTicketExcelRows(tickets: ClosedTicketExportRow[]) {
  return tickets.map((t) => ({
    '#': t.ticket_number,
    'תאריך פתיחה': t.created_at ? new Date(t.created_at).toLocaleString('he-IL') : '',
    'תאריך סגירה': t.closed_at ? new Date(t.closed_at).toLocaleString('he-IL') : '',
    עובד: t.worker_name || '',
    דירה: t.building_number || '',
    תיאור: t.description || '',
    סטטוס: 'סגור',
    עדיפות: PRIORITY_LABEL_HE[(t.priority || 'MEDIUM').toUpperCase()] || (t.priority || ''),
    מדווח: formatReporterNameAndPhone(t.reporter_name, t.reporter_phone),
  }))
}

export async function downloadClosedTicketsExcel(options: {
  tickets: ClosedTicketExportRow[]
  projectName: string
  sheetName?: string
  filename?: string
}) {
  const { tickets, projectName, sheetName = 'היסטוריה' } = options
  const rows = buildClosedTicketExcelRows(tickets)
  const wb = createWorkbook()
  addJsonSheet(wb, sheetName, rows, {
    columnWidths: [6, 18, 18, 16, 7, 42, 10, 10, 18],
  })

  const filename = options.filename ?? ticketHistoryExportFilename(projectName)
  await downloadExcelWorkbook(wb, filename)
}
