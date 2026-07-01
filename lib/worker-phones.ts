import { normalizePhone019 } from '@/lib/sms-019-core'

export type WorkerPhoneSource = {
  phone?: string | null
  extra_phones?: string[] | null
}

export const MAX_WORKER_EXTRA_PHONES = 5

/** Canonical storage / SMS format: 972xxxxxxxxx (accepts 05x, +972, dashes, spaces). */
export function normalizeWorkerPhone(raw: string): string {
  return normalizePhone019(raw.trim())
}

export function isValidWorkerPhone(raw: string): boolean {
  return normalizeWorkerPhone(raw) !== ''
}

export type ParseWorkerPhoneResult =
  | { ok: true; normalized: string }
  | { ok: false; error: string }

export function parseWorkerPhone(
  raw: string,
  fieldLabel = 'מספר טלפון'
): ParseWorkerPhoneResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: `${fieldLabel} נדרש` }
  }
  const normalized = normalizeWorkerPhone(trimmed)
  if (!normalized) {
    return {
      ok: false,
      error: `${fieldLabel} לא תקין — השתמשו ב-05X-XXX-XXXX או 972XXXXXXXXX`,
    }
  }
  return { ok: true, normalized }
}

/** Friendly Israeli display: 05X-XXX-XXXX */
export function formatWorkerPhoneDisplay(phone: string): string {
  const normalized = normalizeWorkerPhone(phone)
  if (!normalized) return phone.trim()
  const local = `0${normalized.slice(3)}`
  if (local.length !== 10) return normalized
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
}

function phoneDedupeKey(raw: string): string {
  return normalizeWorkerPhone(raw)
}

/** All distinct phone numbers for a worker (primary first, then extras), normalized for SMS/WA. */
export function collectWorkerPhones(worker: WorkerPhoneSource): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  const add = (raw?: string | null) => {
    const trimmed = raw?.trim()
    if (!trimmed) return
    const normalized = normalizeWorkerPhone(trimmed)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    out.push(normalized)
  }

  add(worker.phone)
  for (const p of worker.extra_phones ?? []) add(p)
  return out
}

export function workerHasPhone(worker: WorkerPhoneSource): boolean {
  return collectWorkerPhones(worker).length > 0
}

export function formatWorkerPhonesDisplay(worker: WorkerPhoneSource): string {
  return collectWorkerPhones(worker).map(formatWorkerPhoneDisplay).join(' · ')
}

export function sanitizeExtraPhones(
  primary: string,
  extras: string[]
): { ok: true; phones: string[] } | { ok: false; error: string } {
  const primaryNorm = primary.trim() ? normalizeWorkerPhone(primary.trim()) : ''
  const seen = new Set<string>(primaryNorm ? [primaryNorm] : [])
  const cleaned: string[] = []

  for (const raw of extras) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (cleaned.length >= MAX_WORKER_EXTRA_PHONES) {
      return { ok: false, error: `ניתן להוסיף עד ${MAX_WORKER_EXTRA_PHONES} מספרים נוספים` }
    }
    const normalized = normalizeWorkerPhone(trimmed)
    if (!normalized) {
      return { ok: false, error: 'מספר טלפון נוסף לא תקין' }
    }
    if (seen.has(normalized)) continue
    seen.add(normalized)
    cleaned.push(normalized)
  }

  return { ok: true, phones: cleaned }
}
