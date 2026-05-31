/* eslint-disable @typescript-eslint/no-explicit-any */
import XLSXStyle from 'xlsx-js-style'
export { XLSXStyle }

const HEADER_BG = '1E3A5F'
const HEADER_FG = 'FFFFFF'

const BASE_BORDER = {
  top:    { style: 'thin', color: { rgb: 'D1D5DB' } },
  bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
  left:   { style: 'thin', color: { rgb: 'D1D5DB' } },
  right:  { style: 'thin', color: { rgb: 'D1D5DB' } },
}

export const HEADER_STYLE = {
  font:      { bold: true, color: { rgb: HEADER_FG }, sz: 11 },
  fill:      { patternType: 'solid', fgColor: { rgb: HEADER_BG } },
  alignment: { horizontal: 'right', readingOrder: 2 },
  border: {
    top:    { style: 'thin', color: { rgb: HEADER_BG } },
    bottom: { style: 'medium', color: { rgb: '0F1F3D' } },
    left:   { style: 'thin', color: { rgb: HEADER_BG } },
    right:  { style: 'thin', color: { rgb: HEADER_BG } },
  },
}

export const DATA_STYLE = {
  font:      { sz: 10, color: { rgb: '111827' } },
  alignment: { horizontal: 'right', readingOrder: 2 },
  border:    BASE_BORDER,
}

export const STATUS_STYLES: Record<string, any> = {
  NEW:           { fill: { patternType: 'solid', fgColor: { rgb: 'FEF9C3' } }, font: { color: { rgb: '854D0E' }, sz: 10 }, border: BASE_BORDER, alignment: { horizontal: 'center' } },
  ASSIGNED:      { fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } }, font: { color: { rgb: '1E40AF' }, sz: 10 }, border: BASE_BORDER, alignment: { horizontal: 'center' } },
  IN_PROGRESS:   { fill: { patternType: 'solid', fgColor: { rgb: 'E0F2FE' } }, font: { color: { rgb: '0369A1' }, sz: 10 }, border: BASE_BORDER, alignment: { horizontal: 'center' } },
  WAITING_PARTS: { fill: { patternType: 'solid', fgColor: { rgb: 'F3F4F6' } }, font: { color: { rgb: '4B5563' }, sz: 10 }, border: BASE_BORDER, alignment: { horizontal: 'center' } },
  SITE_TOUR:     { fill: { patternType: 'solid', fgColor: { rgb: 'E0E7FF' } }, font: { color: { rgb: '4338CA' }, sz: 10 }, border: BASE_BORDER, alignment: { horizontal: 'center' } },
  PROFESSIONAL_ESCORT: { fill: { patternType: 'solid', fgColor: { rgb: 'F3E8FF' } }, font: { color: { rgb: '7C3AED' }, sz: 10 }, border: BASE_BORDER, alignment: { horizontal: 'center' } },
  CLOSED:        { fill: { patternType: 'solid', fgColor: { rgb: 'DCFCE7' } }, font: { color: { rgb: '15803D' }, bold: true, sz: 10 }, border: BASE_BORDER, alignment: { horizontal: 'center' } },
}

export const PRIORITY_STYLES: Record<string, any> = {
  URGENT: { fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } }, font: { color: { rgb: '991B1B' }, bold: true, sz: 10 }, border: BASE_BORDER, alignment: { horizontal: 'center' } },
  HIGH:   { fill: { patternType: 'solid', fgColor: { rgb: 'FEF3C7' } }, font: { color: { rgb: '92400E' }, sz: 10 },            border: BASE_BORDER, alignment: { horizontal: 'center' } },
  MEDIUM: { fill: { patternType: 'solid', fgColor: { rgb: 'F9FAFB' } }, font: { color: { rgb: '374151' }, sz: 10 },            border: BASE_BORDER, alignment: { horizontal: 'center' } },
  LOW:    { fill: { patternType: 'solid', fgColor: { rgb: 'F9FAFB' } }, font: { color: { rgb: '9CA3AF' }, sz: 10 },            border: BASE_BORDER, alignment: { horizontal: 'center' } },
}

export const ALT_ROW_STYLE = {
  fill:      { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
  font:      { sz: 10, color: { rgb: '111827' } },
  alignment: { horizontal: 'right', readingOrder: 2 },
  border:    BASE_BORDER,
}

/** מחיל סגנון כותרת על שורה 0 בגליון */
export function applyHeaderStyle(ws: any, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const ref = XLSXStyle.utils.encode_cell({ r: 0, c })
    if (ws[ref]) ws[ref].s = HEADER_STYLE
  }
}

/** מגדיר סגנון תא בודד */
export function setCellStyle(ws: any, row: number, col: number, style: any) {
  const ref = XLSXStyle.utils.encode_cell({ r: row, c: col })
  if (ws[ref]) ws[ref].s = style
}

/** מחיל border + RTL על כל תאי הנתונים */
export function applyDataStyles(ws: any, rowCount: number, colCount: number) {
  for (let r = 1; r <= rowCount; r++) {
    const style = r % 2 === 0 ? ALT_ROW_STYLE : DATA_STYLE
    for (let c = 0; c < colCount; c++) {
      const ref = XLSXStyle.utils.encode_cell({ r, c })
      if (ws[ref] && !ws[ref].s) ws[ref].s = style
    }
  }
}
