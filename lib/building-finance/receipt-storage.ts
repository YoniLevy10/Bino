/** Building expense receipt storage helpers. */

export const BUILDING_EXPENSE_RECEIPTS_BUCKET = 'building-expense-receipts' as const
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024
export const RECEIPT_SIGNED_URL_TTL_SEC = 60 * 60 // 1 hour

export const RECEIPT_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const STORAGE_PATH_PREFIX = 'storage:'

/** Durable DB value: storage path with scheme, or legacy absolute URL. */
export function encodeReceiptStoragePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith(STORAGE_PATH_PREFIX) || /^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `${STORAGE_PATH_PREFIX}${trimmed}`
}

export function decodeReceiptStoragePath(receiptUrl: string | null | undefined): string | null {
  if (!receiptUrl?.trim()) return null
  const v = receiptUrl.trim()
  if (v.startsWith(STORAGE_PATH_PREFIX)) return v.slice(STORAGE_PATH_PREFIX.length)
  return null
}

export function isExternalReceiptUrl(receiptUrl: string | null | undefined): boolean {
  return !!receiptUrl && /^https?:\/\//i.test(receiptUrl.trim())
}

export function safeReceiptFileName(name: string): string {
  return name.replace(/[^\w.\-()\u0590-\u05FF ]+/g, '_').slice(0, 180) || 'receipt.pdf'
}

export function extForMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'bin'
}
