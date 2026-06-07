import { describe, expect, it } from 'vitest'
import {
  buildPaidAddonsForDisplay,
  getLockedPaidAddonsCount,
  getPaidAddonCatalogEntry,
} from '@/lib/paid-addons-catalog'
import type { AddonEntitlement } from '@/lib/paid-addons'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

function mockEntitlement(addon_key: string, enabled: boolean): AddonEntitlement {
  const base = getPaidAddonCatalogEntry(addon_key as keyof typeof PAID_ADDON_KEYS)
  return {
    addon_key,
    name_he: base?.title ?? addon_key,
    description_he: base?.description ?? null,
    price_ils_monthly: 100,
    is_active: true,
    sort_order: 0,
    enabled,
  }
}

const ALL_KEYS = Object.values(PAID_ADDON_KEYS)

describe('paid addons catalog', () => {
  it('catalog includes all premium add-on keys', () => {
    for (const key of ALL_KEYS) {
      expect(getPaidAddonCatalogEntry(key)).toBeDefined()
    }
  })

  it('all disabled entitlements show as locked', () => {
    const entitlements = ALL_KEYS.map((key) => mockEntitlement(key, false))
    const display = buildPaidAddonsForDisplay(entitlements)
    expect(display.length).toBeGreaterThanOrEqual(4)
    expect(display.every((e) => e.locked)).toBe(true)
    expect(getLockedPaidAddonsCount(display)).toBe(display.length)
  })

  it('all enabled entitlements show as unlocked', () => {
    const entitlements = ALL_KEYS.map((key) => mockEntitlement(key, true))
    const display = buildPaidAddonsForDisplay(entitlements)
    expect(display.every((e) => !e.locked)).toBe(true)
    expect(getLockedPaidAddonsCount(display)).toBe(0)
  })

  it('mixed enablement reflects correct lock flags', () => {
    const entitlements = ALL_KEYS.map((key) =>
      mockEntitlement(key, key === 'pilot_sms' || key === 'project_documents')
    )
    const display = buildPaidAddonsForDisplay(entitlements)
    expect(display.find((e) => e.id === 'pilot_sms')?.locked).toBe(false)
    expect(display.find((e) => e.id === 'calendar')?.locked).toBe(true)
    expect(getLockedPaidAddonsCount(display)).toBeGreaterThanOrEqual(2)
  })
})
