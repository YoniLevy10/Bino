import type ExcelJS from 'exceljs'
import { downloadExcelWorkbook as downloadViaBlob, workbookToUint8Array } from '@/lib/excel-workbook'

/** Thin re-export for existing import paths. Prefer `@/lib/excel-workbook`. */
export async function downloadExcelWorkbook(wb: ExcelJS.Workbook, filename: string) {
  await downloadViaBlob(wb, filename)
}

export { workbookToUint8Array }
