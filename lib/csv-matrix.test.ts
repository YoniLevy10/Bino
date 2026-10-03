import { describe, expect, it } from 'vitest'
import { parseCsvToMatrix } from './csv-matrix'

describe('parseCsvToMatrix', () => {
  it('parses comma CSV and strips BOM', () => {
    const matrix = parseCsvToMatrix('\uFEFFשם,טלפון\nא,1\n')
    expect(matrix).toEqual([
      ['שם', 'טלפון'],
      ['א', '1'],
    ])
  })

  it('prefers semicolon when dominant', () => {
    const matrix = parseCsvToMatrix('שם;טלפון;דירה\nכהן;050;1\n')
    expect(matrix[0]).toEqual(['שם', 'טלפון', 'דירה'])
    expect(matrix[1]).toEqual(['כהן', '050', '1'])
  })

  it('handles quoted commas', () => {
    const matrix = parseCsvToMatrix('שם,הערות\n"כהן, דוד","קומה 2, דירה 3"\n')
    expect(matrix[1]).toEqual(['כהן, דוד', 'קומה 2, דירה 3'])
  })
})
