import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'
import { computeBudgetUtilization, yearElapsedFraction } from '@/lib/building-finance/budget-math'
import { absoluteBuildingSignUrl } from '@/lib/building-governance/signature-link-notify'
import { buildingSignPublicPath } from '@/lib/building-governance/roles'

describe('isBuildingGovernanceAutoNotifyEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults ON in development when env unset', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BUILDING_GOVERNANCE_AUTO_NOTIFY', '')
    expect(isBuildingGovernanceAutoNotifyEnabled()).toBe(true)
  })

  it('defaults OFF in production when env unset', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BUILDING_GOVERNANCE_AUTO_NOTIFY', '')
    expect(isBuildingGovernanceAutoNotifyEnabled()).toBe(false)
  })

  it('explicit true enables in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BUILDING_GOVERNANCE_AUTO_NOTIFY', 'true')
    expect(isBuildingGovernanceAutoNotifyEnabled()).toBe(true)
  })

  it('explicit false disables in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BUILDING_GOVERNANCE_AUTO_NOTIFY', '0')
    expect(isBuildingGovernanceAutoNotifyEnabled()).toBe(false)
  })
})

describe('budget alert kinds from utilization', () => {
  it('flags overspent when spent exceeds planned', () => {
    const u = computeBudgetUtilization({
      period_key: '2026',
      planned: 1000,
      spent: 1200,
      elapsedFraction: 0.5,
    })
    expect(u.remaining).toBeLessThan(0)
    expect(u.over_pace).toBe(true)
  })

  it('flags over_pace mid-year without full overspend', () => {
    const u = computeBudgetUtilization({
      period_key: '2026',
      planned: 1000,
      spent: 600,
      elapsedFraction: 0.4,
    })
    expect(u.over_pace).toBe(true)
    expect(u.remaining).toBeGreaterThan(0)
  })

  it('yearElapsedFraction is within 0..1', () => {
    const f = yearElapsedFraction(new Date('2026-06-15T12:00:00Z'))
    expect(f).toBeGreaterThan(0.4)
    expect(f).toBeLessThan(0.6)
  })
})

describe('building sign public URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds path and absolute URL from public app origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://bino.casa')
    const token = 'abc123'
    expect(buildingSignPublicPath(token)).toBe('/intake/building-sign/abc123')
    expect(absoluteBuildingSignUrl(token)).toBe('https://bino.casa/intake/building-sign/abc123')
  })
})
