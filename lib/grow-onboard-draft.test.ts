import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGrowOnboardDraft, saveGrowOnboardDraft } from '@/lib/grow-onboard-draft'

describe('grow-onboard-draft', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => store.clear(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips business number and phone', () => {
    saveGrowOnboardDraft({ business_number: '512345678', phone: '0501234567' })
    expect(loadGrowOnboardDraft()).toEqual({
      business_number: '512345678',
      phone: '0501234567',
    })
  })

  it('returns null when empty', () => {
    expect(loadGrowOnboardDraft()).toBeNull()
  })
})
