/* eslint-disable @typescript-eslint/no-explicit-any */

/** Download an xlsx workbook via Blob — works after async import (mobile Safari). */
export function downloadExcelWorkbook(wb: any, XLSX: { write: (wb: any, opts: { bookType: 'xlsx'; type: 'buffer' }) => Uint8Array | Buffer }, filename: string) {
  const safe = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
  const blob = new Blob([buffer as unknown as BlobPart], {
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
