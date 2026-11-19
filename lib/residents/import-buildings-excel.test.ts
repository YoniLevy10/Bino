import { describe, expect, it } from 'vitest'
import { createWorkbook, workbookToUint8Array } from '@/lib/excel/excel-workbook'
import { parseBuildingsWorkbook, buildingsTemplateRows } from '@/lib/residents/import-buildings-excel'

describe('parseBuildingsWorkbook', () => {
  it('parses Hebrew headers from xlsx', async () => {
    const wb = createWorkbook()
    const sheet = wb.addWorksheet('בניינים')
    sheet.addRow(['שם', 'קוד', 'כתובת'])
    sheet.addRow(['מגדל א', 'T1', 'רחוב 1'])
    sheet.addRow(['מגדל ב', 'T2', ''])
    const bytes = await workbookToUint8Array(wb)
    const buf = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
    const parsed = await parseBuildingsWorkbook(buf, 't.xlsx')
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]).toMatchObject({ name: 'מגדל א', project_code: 'T1', address: 'רחוב 1' })
    expect(parsed.rows[1]?.project_code).toBe('T2')
  })

  it('exports template rows', () => {
    expect(buildingsTemplateRows().length).toBeGreaterThan(0)
  })
})
