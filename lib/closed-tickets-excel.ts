import { downloadExcelWorkbook } from '@/lib/excel-download'
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
    מדווח: t.reporter_name || t.reporter_phone || '',
  }))
}

export async function downloadClosedTicketsExcel(options: {
  tickets: ClosedTicketExportRow[]
  projectName: string
  sheetName?: string
  filename?: string
}) {
  const { tickets, projectName, sheetName = 'היסטוריה' } = options
  const { XLSXStyle: XLSX, applyHeaderStyle, applyDataStyles } = await import('@/lib/excel-style')
  const rows = buildClosedTicketExcelRows(tickets)

  const ws = XLSX.utils.json_to_sheet(rows)
  const COLS = 9
  ws['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 7 }, { wch: 42 }, { wch: 10 }, { wch: 10 }, { wch: 18 }]
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] as string }
  applyHeaderStyle(ws, COLS)
  applyDataStyles(ws, rows.length, COLS)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const filename = options.filename ?? ticketHistoryExportFilename(projectName)
  downloadExcelWorkbook(wb, XLSX, filename)
}
