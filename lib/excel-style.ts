/**
 * Shared Excel cell styles for manager exports (ExcelJS).
 * Colors match the previous xlsx-js-style theme.
 */
import type { Borders, Fill, Font, Alignment } from 'exceljs'

export type ExcelCellStyle = {
  font?: Partial<Font>
  fill?: Fill
  border?: Partial<Borders>
  alignment?: Partial<Alignment>
}

const HEADER_BG = 'FF1E3A5F'
const HEADER_FG = 'FFFFFFFF'
const BORDER_GRAY = 'FFD1D5DB'

const BASE_BORDER: Partial<Borders> = {
  top: { style: 'thin', color: { argb: BORDER_GRAY } },
  bottom: { style: 'thin', color: { argb: BORDER_GRAY } },
  left: { style: 'thin', color: { argb: BORDER_GRAY } },
  right: { style: 'thin', color: { argb: BORDER_GRAY } },
}

export const HEADER_STYLE: ExcelCellStyle = {
  font: { bold: true, color: { argb: HEADER_FG }, size: 11 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } },
  alignment: { horizontal: 'right', readingOrder: 'rtl' },
  border: {
    top: { style: 'thin', color: { argb: HEADER_BG } },
    bottom: { style: 'medium', color: { argb: 'FF0F1F3D' } },
    left: { style: 'thin', color: { argb: HEADER_BG } },
    right: { style: 'thin', color: { argb: HEADER_BG } },
  },
}

export const DATA_STYLE: ExcelCellStyle = {
  font: { size: 10, color: { argb: 'FF111827' } },
  alignment: { horizontal: 'right', readingOrder: 'rtl' },
  border: BASE_BORDER,
}

export const ALT_ROW_STYLE: ExcelCellStyle = {
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } },
  font: { size: 10, color: { argb: 'FF111827' } },
  alignment: { horizontal: 'right', readingOrder: 'rtl' },
  border: BASE_BORDER,
}

function statusStyle(bg: string, fg: string, bold = false): ExcelCellStyle {
  return {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } },
    font: { color: { argb: fg }, size: 10, bold },
    border: BASE_BORDER,
    alignment: { horizontal: 'center' },
  }
}

export const STATUS_STYLES: Record<string, ExcelCellStyle> = {
  NEW: statusStyle('FFFEF9C3', 'FF854D0E'),
  ASSIGNED: statusStyle('FFDBEAFE', 'FF1E40AF'),
  IN_PROGRESS: statusStyle('FFE0F2FE', 'FF0369A1'),
  WAITING_PARTS: statusStyle('FFF3F4F6', 'FF4B5563'),
  SITE_TOUR: statusStyle('FFE0E7FF', 'FF4338CA'),
  PROFESSIONAL_ESCORT: statusStyle('FFF3E8FF', 'FF7C3AED'),
  CLOSED: statusStyle('FFDCFCE7', 'FF15803D', true),
}

export const PRIORITY_STYLES: Record<string, ExcelCellStyle> = {
  URGENT: statusStyle('FFFEE2E2', 'FF991B1B', true),
  HIGH: statusStyle('FFFEF3C7', 'FF92400E'),
  MEDIUM: statusStyle('FFF9FAFB', 'FF374151'),
  LOW: statusStyle('FFF9FAFB', 'FF9CA3AF'),
}
