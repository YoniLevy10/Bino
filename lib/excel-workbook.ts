/**
 * ExcelJS-based workbook helpers (replace vulnerable SheetJS `xlsx` / `xlsx-js-style`).
 * Used for manager browser import + export. Hebrew/RTL defaults.
 */
import ExcelJS from 'exceljs'
import { parseCsvToMatrix } from '@/lib/csv-matrix'
import {
  ALT_ROW_STYLE,
  DATA_STYLE,
  HEADER_STYLE,
  type ExcelCellStyle,
} from '@/lib/excel-style'

export type CellValue = string | number | boolean | Date | null | undefined
export type JsonRow = Record<string, CellValue>

/** Soft cap for manager-uploaded resident import files (browser parse). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

const ZIP_MAGIC = [0x50, 0x4b] // PK — xlsx / zip
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0] // legacy .xls

export function createWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'BINO'
  wb.created = new Date()
  return wb
}

function headersFromRows(rows: JsonRow[]): string[] {
  const seen = new Set<string>()
  const headers: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        headers.push(key)
      }
    }
  }
  return headers
}

export type AddJsonSheetOptions = {
  columnWidths?: number[]
  freezeHeader?: boolean
  autoFilter?: boolean
  /** Apply BINO header + alternating data styles (default true). */
  styled?: boolean
}

/** Append a sheet from an array of plain objects (keys = Hebrew/English headers). */
export function addJsonSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  rows: JsonRow[],
  options: AddJsonSheetOptions = {}
): ExcelJS.Worksheet {
  const {
    columnWidths,
    freezeHeader = true,
    autoFilter = true,
    styled = true,
  } = options

  const headers = headersFromRows(rows)
  const ws = wb.addWorksheet(sheetName.slice(0, 31) || 'Sheet1', {
    views: [
      {
        rightToLeft: true,
        state: freezeHeader ? 'frozen' : 'normal',
        ySplit: freezeHeader ? 1 : 0,
      },
    ],
  })

  if (headers.length === 0) {
    ws.addRow([])
    return ws
  }

  ws.addRow(headers)
  for (const row of rows) {
    ws.addRow(
      headers.map((h) => {
        const v = row[h]
        return v === null || v === undefined ? '' : v
      })
    )
  }

  if (columnWidths?.length) {
    columnWidths.forEach((wch, i) => {
      ws.getColumn(i + 1).width = wch
    })
  } else {
    headers.forEach((_, i) => {
      ws.getColumn(i + 1).width = 16
    })
  }

  if (autoFilter && rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: headers.length },
    }
  }

  if (styled) {
    applyHeaderStyle(ws, headers.length)
    applyDataStyles(ws, rows.length, headers.length)
  }

  return ws
}

export function applyHeaderStyle(ws: ExcelJS.Worksheet, colCount?: number) {
  const count = colCount ?? ws.columnCount
  const row = ws.getRow(1)
  for (let c = 1; c <= count; c++) {
    row.getCell(c).style = { ...HEADER_STYLE }
  }
}

export function applyDataStyles(ws: ExcelJS.Worksheet, rowCount: number, colCount?: number) {
  const count = colCount ?? ws.columnCount
  for (let excelRow = 2; excelRow <= rowCount + 1; excelRow++) {
    // Match prior SheetJS parity: first data row uses DATA_STYLE
    const style = excelRow % 2 === 0 ? DATA_STYLE : ALT_ROW_STYLE
    const row = ws.getRow(excelRow)
    for (let c = 1; c <= count; c++) {
      row.getCell(c).style = { ...style }
    }
  }
}

/**
 * Style a cell. `row` / `col` are 0-based like former SheetJS encode_cell
 * (row 0 = header, row 1 = first data row).
 */
export function setCellStyle(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  style: ExcelCellStyle
) {
  ws.getRow(row + 1).getCell(col + 1).style = { ...style }
}

export async function workbookToUint8Array(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  const buffer = await wb.xlsx.writeBuffer()
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
}

/** Download an xlsx workbook via Blob — works after async import (mobile Safari). */
export async function downloadExcelWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const safe = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  const buffer = await workbookToUint8Array(wb)
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safe
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1]
}

function looksLikeOle(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === OLE_MAGIC[0] &&
    bytes[1] === OLE_MAGIC[1] &&
    bytes[2] === OLE_MAGIC[2] &&
    bytes[3] === OLE_MAGIC[3]
  )
}

function looksLikeTextCsv(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512))
  let printable = 0
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i]
    if (b === 0) return false
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b !== 127)) printable++
  }
  return sample.length > 0 && printable / sample.length > 0.9
}

function cellToPlain(v: unknown): unknown {
  if (v == null) return ''
  if (typeof v === 'object' && v !== null) {
    if ('text' in v) return String((v as { text: string }).text ?? '')
    if ('result' in v) return (v as { result: unknown }).result ?? ''
    if ('richText' in v) {
      const parts = (v as { richText: Array<{ text?: string }> }).richText
      return parts.map((p) => p.text ?? '').join('')
    }
  }
  return v
}

export type ParseWorkbookOptions = {
  fileName?: string
  maxBytes?: number
}

/**
 * Read first sheet as a matrix of cell values (header detection stays in import-residents-excel).
 * Supports .xlsx (OOXML) and .csv. Rejects legacy .xls and oversized buffers.
 */
export async function parseWorkbookToMatrix(
  buffer: ArrayBuffer,
  options: ParseWorkbookOptions = {}
): Promise<unknown[][]> {
  const maxBytes = options.maxBytes ?? MAX_IMPORT_BYTES
  if (buffer.byteLength > maxBytes) {
    throw new Error(`קובץ גדול מדי (מקסימום ${Math.floor(maxBytes / (1024 * 1024))}MB)`)
  }
  if (buffer.byteLength === 0) {
    throw new Error('הקובץ ריק')
  }

  const bytes = new Uint8Array(buffer)
  const lowerName = (options.fileName || '').toLowerCase()

  if (looksLikeOle(bytes) || (lowerName.endsWith('.xls') && !lowerName.endsWith('.xlsx'))) {
    throw new Error('קבצי Excel ישנים (‎.xls) אינם נתמכים. שמרו כ־xlsx או csv ונסו שוב.')
  }

  if (lowerName.endsWith('.csv') || (!looksLikeZip(bytes) && looksLikeTextCsv(bytes))) {
    const text = new TextDecoder('utf-8').decode(bytes)
    return parseCsvToMatrix(text)
  }

  if (!looksLikeZip(bytes) && !lowerName.endsWith('.xlsx')) {
    throw new Error('לא ניתן לקרוא את הקובץ. השתמשו ב־xlsx או csv.')
  }

  const wb = new ExcelJS.Workbook()
  // ExcelJS accepts ArrayBuffer in browser and Buffer in Node.
  await wb.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0])

  const ws = wb.worksheets[0]
  if (!ws) return []

  const matrix: unknown[][] = []
  const colCount = Math.max(ws.actualColumnCount || 0, ws.columnCount || 0)

  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = row.values as Array<unknown>
    const cells: unknown[] = []
    const last = Math.max(values.length - 1, colCount)
    for (let c = 1; c <= last; c++) {
      cells.push(cellToPlain(values[c]))
    }
    while (matrix.length < rowNumber - 1) matrix.push([])
    matrix[rowNumber - 1] = cells
  })

  return matrix
}

/** Build an in-memory .xlsx buffer from a matrix (tests / fixtures). */
export async function matrixToXlsxArrayBuffer(
  data: unknown[][],
  sheetName = 'Sheet1'
): Promise<ArrayBuffer> {
  const wb = createWorkbook()
  const ws = wb.addWorksheet(sheetName)
  for (const row of data) {
    ws.addRow(row.map((c) => (c == null ? '' : c)))
  }
  const u8 = await workbookToUint8Array(wb)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}
