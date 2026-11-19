/**
 * Parse Excel/CSV of buildings for superadmin launch wizard.
 * Expected columns (Hebrew or English): name/שם, project_code/קוד, address/כתובת
 */
import { parseWorkbookToMatrix } from '@/lib/excel/excel-workbook'

export type BuildingImportRow = {
  name: string
  project_code: string
  address?: string
}

const NAME_HINTS = [/שם/i, /name/i, /בניין/i, /building/i, /פרויקט/i]
const CODE_HINTS = [/קוד/i, /code/i, /project_code/i, /מזהה/i]
const ADDR_HINTS = [/כתובת/i, /address/i, /addr/i]

function normHeader(h: unknown): string {
  return (typeof h === 'string' ? h : h == null ? '' : String(h)).trim()
}

function pickCol(headers: string[], hints: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (hints.some((rx) => rx.test(headers[i]!))) return i
  }
  return -1
}

function slugCode(name: string, index: number): string {
  const ascii = name
    .normalize('NFKD')
    .replace(/[^\w]+/g, '')
    .slice(0, 8)
    .toUpperCase()
  return (ascii || `B${index + 1}`).slice(0, 12)
}

export async function parseBuildingsWorkbook(
  bytes: ArrayBuffer,
  fileName?: string
): Promise<{ rows: BuildingImportRow[]; errors: string[] }> {
  const matrix = await parseWorkbookToMatrix(bytes, { fileName: fileName || 'buildings.xlsx' })
  if (!matrix.length) return { rows: [], errors: ['קובץ ריק'] }

  let headerIdx = 0
  let best = -1
  for (let r = 0; r < Math.min(matrix.length, 5); r++) {
    const cells = (matrix[r] || []).map(normHeader)
    let score = 0
    for (const c of cells) {
      if (NAME_HINTS.some((rx) => rx.test(c))) score += 2
      if (CODE_HINTS.some((rx) => rx.test(c))) score += 2
      if (ADDR_HINTS.some((rx) => rx.test(c))) score += 1
    }
    if (score > best) {
      best = score
      headerIdx = r
    }
  }

  const headers = (matrix[headerIdx] || []).map(normHeader)
  const nameCol = pickCol(headers, NAME_HINTS)
  const codeCol = pickCol(headers, CODE_HINTS)
  const addrCol = pickCol(headers, ADDR_HINTS)

  if (nameCol < 0 && headers.length === 0) {
    return { rows: [], errors: ['לא נמצאה שורת כותרות'] }
  }

  const rows: BuildingImportRow[] = []
  const errors: string[] = []
  const usedCodes = new Set<string>()

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] || []
    const name =
      nameCol >= 0
        ? String(line[nameCol] ?? '').trim()
        : String(line[0] ?? '').trim()
    if (!name) continue

    let code =
      codeCol >= 0
        ? String(line[codeCol] ?? '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_')
        : ''
    if (!code) code = slugCode(name, rows.length)
    if (usedCodes.has(code)) {
      code = `${code}_${rows.length + 1}`.slice(0, 40)
    }
    usedCodes.add(code)

    const address =
      addrCol >= 0 ? String(line[addrCol] ?? '').trim() || undefined : undefined

    if (code.length > 40) {
      errors.push(`שורה ${r + 1}: קוד ארוך מדי`)
      continue
    }
    rows.push({ name: name.slice(0, 200), project_code: code, address: address?.slice(0, 500) })
  }

  return { rows, errors }
}

export function buildingsTemplateRows(): BuildingImportRow[] {
  return [
    { name: 'בניין לדוגמה', project_code: 'BLDG1', address: 'רחוב הדוגמה 1, תל אביב' },
  ]
}
