import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import {
  buildResidentsImportPayload,
  findResidentsHeaderRowIndex,
  guessResidentsColumnMapping,
  matrixToResidentRows,
  parseResidentsWorkbook,
} from './import-residents-excel'

function workbookBuffer(data: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

describe('import-residents-excel', () => {
  it('maps שם דייר instead of שם בניין when both exist', () => {
    const { rows, headers, mapping } = parseResidentsWorkbook(
      workbookBuffer([
        ['שם בניין', 'שם דייר', 'טלפון', 'דירה'],
        ['בוזגלו 4', 'אוריאל ברמי', '0501234567', '51'],
        ['', 'משה כהן', '0509876543', '12'],
        ['', 'דוד לוי', '0521111111', '8'],
      ])
    )

    expect(headers).toEqual(['שם בניין', 'שם דייר', 'טלפון', 'דירה'])
    expect(mapping.full_name).toBe('שם דייר')
    expect(mapping.project_name).toBe('שם בניין')

    const payload = buildResidentsImportPayload(rows, mapping, {
      forcedProjectName: 'בוזגלו 4',
    })

    expect(payload).toHaveLength(3)
    expect(payload.map((r) => r.full_name)).toEqual(['אוריאל ברמי', 'משה כהן', 'דוד לוי'])
    expect(payload.map((r) => r.apartment_number)).toEqual(['51', '12', '8'])
  })

  it('skips a title row before real headers', () => {
    const matrix = [
      ['רשימת דיירים - בוזגלו 4', '', '', ''],
      ['שם', 'טלפון', 'דירה', 'הערות'],
      ['אוריאל ברמי', '0501234567', '51', ''],
      ['משה כהן', '0509876543', '12', ''],
    ]

    expect(findResidentsHeaderRowIndex(matrix)).toBe(1)

    const rows = matrixToResidentRows(matrix, 1)
    const mapping = guessResidentsColumnMapping(['שם', 'טלפון', 'דירה', 'הערות'])
    const payload = buildResidentsImportPayload(rows, mapping, { forcedProjectName: 'בוזגלו 4' })

    expect(payload).toHaveLength(2)
    expect(payload[0].full_name).toBe('אוריאל ברמי')
    expect(payload[1].full_name).toBe('משה כהן')
  })

  it('keeps export format mapping stable', () => {
    const { mapping } = parseResidentsWorkbook(
      workbookBuffer([
        ['שם מלא', 'טלפון', 'אימייל', 'שוכר', 'דירה', 'בניין', 'הערות'],
        ['אוריאל ברמי', '0501234567', '', '', '51', 'בוזגלו 4', ''],
        ['משה כהן', '0509876543', '', '', '12', 'בוזגלו 4', ''],
      ])
    )

    expect(mapping.full_name).toBe('שם מלא')
    expect(mapping.phone).toBe('טלפון')
    expect(mapping.apartment_number).toBe('דירה')
    expect(mapping.project_name).toBe('בניין')
  })

  it('uses plain שם column when no building-name column exists', () => {
    const mapping = guessResidentsColumnMapping(['שם', 'טלפון', 'דירה'])
    expect(mapping.full_name).toBe('שם')
  })

  it('reads primary phone when sheet has duplicate טלפון/שם/מייל columns', () => {
    const { rows, mapping } = parseResidentsWorkbook(
      workbookBuffer([
        ['דירה', 'שם', 'טלפון', 'מייל', 'שם', 'טלפון', 'סטטוס', 'בעלים', 'טלפון', 'מייל'],
        ['1', 'כהן סימון', '050-2377750', 'mscohad@gmail.com', '', '', '', '', '', ''],
        ['2', 'אסואד מיקי', '054-6649957', 'm@b.com', 'אסואד דינה', '050-8900288', '', '', '', ''],
      ])
    )

    expect(mapping.full_name).toBe('שם')
    expect(mapping.phone).toBe('טלפון')
    expect(mapping.apartment_number).toBe('דירה')

    const payload = buildResidentsImportPayload(rows, mapping, {
      forcedProjectName: 'מקור חיים 40 א',
    })

    expect(payload).toHaveLength(2)
    expect(payload[0]).toMatchObject({
      full_name: 'כהן סימון',
      phone: '0502377750',
      apartment_number: '1',
    })
    expect(payload[1]).toMatchObject({
      full_name: 'אסואד מיקי',
      phone: '0546649957',
      apartment_number: '2',
    })
  })
})
