import { describe, expect, it } from 'vitest'
import { getSetupPackageNavFeatures } from '@/lib/client-nav-features'
import {
  getLockedPaidAddons,
  getPaidAddonsForDisplay,
  PAID_ADDON_CATALOG,
} from '@/lib/paid-addons-catalog'

describe('paid addons catalog', () => {
  it('lists all four premium add-ons on the addons page', () => {
    expect(PAID_ADDON_CATALOG.map((e) => e.id)).toEqual([
      'calendar',
      'attendance',
      'pilot_sms',
      'project_documents',
    ])
  })

  it('setup package marks every catalog entry as locked', () => {
    const setup = getSetupPackageNavFeatures()
    const display = getPaidAddonsForDisplay(setup)
    expect(display).toHaveLength(4)
    expect(display.every((e) => e.locked)).toBe(true)
    expect(getLockedPaidAddons(setup)).toHaveLength(4)
  })

  it('legacy unlimited shows all add-ons as active', () => {
    const display = getPaidAddonsForDisplay(null)
    expect(display).toHaveLength(4)
    expect(display.every((e) => !e.locked)).toBe(true)
    expect(getLockedPaidAddons(null)).toHaveLength(0)
  })

  it('mixed enablement shows full catalog with correct lock flags', () => {
    const enabled = [...getSetupPackageNavFeatures(), 'pilot_sms', 'project_documents']
    const display = getPaidAddonsForDisplay(enabled)
    expect(display.find((e) => e.id === 'pilot_sms')?.locked).toBe(false)
    expect(display.find((e) => e.id === 'calendar')?.locked).toBe(true)
    expect(getLockedPaidAddons(enabled)).toHaveLength(2)
  })
})
