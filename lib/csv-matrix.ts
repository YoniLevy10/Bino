/**
 * Lightweight CSV → matrix parser for browser import (no SheetJS / no Node streams).
 * Supports UTF-8 BOM, comma or semicolon delimiters, and basic quoted fields.
 */

function detectDelimiter(firstLine: string): ',' | ';' {
  let inQuotes = false
  let commas = 0
  let semis = 0
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i]
    if (ch === '"') {
      if (inQuotes && firstLine[i + 1] === '"') {
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (inQuotes) continue
    if (ch === ',') commas++
    if (ch === ';') semis++
  }
  return semis > commas ? ';' : ','
}

function parseCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (!inQuotes && ch === delimiter) {
      cells.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur)
  return cells.map((c) => c.trim())
}

export function parseCsvToMatrix(text: string): unknown[][] {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleaned.split('\n')
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return []

  const delimiter = detectDelimiter(lines[0])
  return lines.map((line) => parseCsvLine(line, delimiter))
}
