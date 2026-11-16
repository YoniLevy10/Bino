import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBuildingFinanceDevUnlocked } from '@/lib/building-finance/dev-unlock'
import { isNavFeatureEnabled } from '@/lib/client-nav-features'

describe('isBuildingFinanceDevUnlocked (retired no-op)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is always false even when BUILDING_FINANCE_DEV_UNLOCK=true', () => {
    vi.stubEnv('BUILDING_FINANCE_DEV_UNLOCK', 'true')
    expect(isBuildingFinanceDevUnlocked()).toBe(false)
  })

  it('finance/reports stay enabled as core nav without DEV unlock', () => {
    expect(isNavFeatureEnabled(['dashboard', 'tickets'], 'finance')).toBe(true)
    expect(isNavFeatureEnabled(['dashboard', 'tickets'], 'reports')).toBe(true)
  })
})
