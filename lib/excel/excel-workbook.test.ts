import { describe, expect, it } from 'vitest'
import {
  addJsonSheet,
  createWorkbook,
  matrixToXlsxArrayBuffer,
  parseWorkbookToMatrix,
  workbookToUint8Array,
} from './excel-workbook'

describe('excel-workbook', () => {
  it('round-trips Hebrew rows through xlsx buffer', async () => {
    const buf = await matrixToXlsxArrayBuffer([
      ['שם', 'טלפון'],
      ['כהן', '0501234567'],
    ])
    const matrix = await parseWorkbookToMatrix(buf, { fileName: 't.xlsx' })
    expect(matrix[0]?.slice(0, 2)).toEqual(['שם', 'טלפון'])
    expect(matrix[1]?.slice(0, 2)).toEqual(['כהן', '0501234567'])
  })

  it('builds a downloadable workbook buffer with styled json sheet', async () => {
    const wb = createWorkbook()
    addJsonSheet(wb, 'דיירים', [{ שם: 'א', טלפון: '1' }], { columnWidths: [12, 14] })
    const u8 = await workbookToUint8Array(wb)
    expect(u8.byteLength).toBeGreaterThan(100)
    // ZIP / OOXML magic
    expect(u8[0]).toBe(0x50)
    expect(u8[1]).toBe(0x4b)
  })
})
