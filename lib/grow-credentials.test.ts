import { describe, expect, it } from 'vitest'
import {
  assertTenantCanEnableGrow,
  buildGrowCollectionsAccountStatus,
  isGrowCollectionsConfigured,
  normalizeGrowUserId,
} from '@/lib/grow-credentials'

describe('normalizeGrowUserId', () => {
  it('trims and treats empty as null', () => {
    expect(normalizeGrowUserId('  123  ')).toBe('123')
    expect(normalizeGrowUserId('   ')).toBeNull()
    expect(normalizeGrowUserId(null)).toBeNull()
  })
})

describe('buildGrowCollectionsAccountStatus', () => {
  it('is not ready without platform keys', () => {
    const s = buildGrowCollectionsAccountStatus({
      platformConfigured: false,
      enabled: true,
      userId: 'u1',
    })
    expect(s.ready).toBe(false)
    expect(s.message).toMatch(/GROW_API_KEY/)
  })

  it('is ready when platform + enabled + userId', () => {
    const s = buildGrowCollectionsAccountStatus({
      platformConfigured: true,
      enabled: true,
      userId: 'u1',
    })
    expect(s.ready).toBe(true)
    expect(s.hasOwnAccount).toBe(true)
  })

  it('has account but not ready when disabled', () => {
    const s = buildGrowCollectionsAccountStatus({
      platformConfigured: true,
      enabled: false,
      userId: 'u1',
    })
    expect(s.hasOwnAccount).toBe(true)
    expect(s.ready).toBe(false)
  })
})

describe('assertTenantCanEnableGrow', () => {
  it('allows disable without userId', () => {
    expect(assertTenantCanEnableGrow({ enabled: false, userId: null }).ok).toBe(true)
  })

  it('blocks enable without userId', () => {
    const r = assertTenantCanEnableGrow({ enabled: true, userId: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/userId/)
  })
})

describe('isGrowCollectionsConfigured', () => {
  it('requires enabled and userId', () => {
    expect(isGrowCollectionsConfigured({ grow_enabled: true, grow_user_id: 'u1' })).toBe(true)
    expect(isGrowCollectionsConfigured({ grow_enabled: false, grow_user_id: 'u1' })).toBe(false)
    expect(isGrowCollectionsConfigured({ grow_enabled: true, grow_user_id: '' })).toBe(false)
  })
})
