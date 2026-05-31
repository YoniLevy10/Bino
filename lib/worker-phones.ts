import { normalizePhone019 } from '@/lib/sms-019-core'

export type WorkerPhoneSource = {
  phone?: string | null
  extra_phones?: string[] | null
}

export const MAX_WORKER_EXTRA_PHONES = 5

function phoneDedupeKey(raw: string): string {
  return normalizePhone019(raw) || raw.replace(/\D/g, '')
}

/** All distinct phone numbers for a worker (primary first, then extras). */
export function collectWorkerPhones(worker: WorkerPhoneSource): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  const add = (raw?: string | null) => {
    const trimmed = raw?.trim()
    if (!trimmed) return
    const key = phoneDedupeKey(trimmed)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(trimmed)
  }

  add(worker.phone)
  for (const p of worker.extra_phones ?? []) add(p)
  return out
}

export function workerHasPhone(worker: WorkerPhoneSource): boolean {
  return collectWorkerPhones(worker).length > 0
}

export function formatWorkerPhonesDisplay(worker: WorkerPhoneSource): string {
  return collectWorkerPhones(worker).join(' · ')
}

export function sanitizeExtraPhones(
  primary: string,
  extras: string[]
): { ok: true; phones: string[] } | { ok: false; error: string } {
  const primaryTrim = primary.trim()
  const primaryKey = primaryTrim ? phoneDedupeKey(primaryTrim) : ''
  const seen = new Set<string>(primaryKey ? [primaryKey] : [])
  const cleaned: string[] = []

  for (const raw of extras) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (cleaned.length >= MAX_WORKER_EXTRA_PHONES) {
      return { ok: false, error: `ניתן להוסיף עד ${MAX_WORKER_EXTRA_PHONES} מספרים נוספים` }
    }
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length < 9) {
      return { ok: false, error: 'מספר טלפון נוסף לא תקין (לפחות 9 ספרות)' }
    }
    const key = phoneDedupeKey(trimmed) || digits
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(trimmed)
  }

  return { ok: true, phones: cleaned }
}
