/** Last Grow registration fields — reuse across buildings (local only). */

const STORAGE_KEY = 'bino_grow_onboard_draft_v1'

export type GrowOnboardDraft = {
  business_number: string
  phone: string
}

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage != null
  } catch {
    return false
  }
}

export function loadGrowOnboardDraft(): GrowOnboardDraft | null {
  if (!storageAvailable()) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GrowOnboardDraft>
    const business_number =
      typeof parsed.business_number === 'string' ? parsed.business_number.trim() : ''
    const phone = typeof parsed.phone === 'string' ? parsed.phone.trim() : ''
    if (!business_number && !phone) return null
    return { business_number, phone }
  } catch {
    return null
  }
}

export function saveGrowOnboardDraft(draft: GrowOnboardDraft): void {
  if (!storageAvailable()) return
  try {
    const business_number = draft.business_number.trim()
    const phone = draft.phone.trim()
    if (!business_number && !phone) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ business_number, phone }))
  } catch {
    /* ignore quota / private mode */
  }
}
