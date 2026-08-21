import { describe, expect, it } from 'vitest'
import {
  assertTenantCanEnableMorning,
  buildCollectionsAccountStatus,
} from '@/lib/greeninvoice-tenant-account'

describe('buildCollectionsAccountStatus', () => {
  it('is not ready without personal Morning keys', () => {
    const s = buildCollectionsAccountStatus({
      enabled: true,
      apiKeyId: null,
      apiSecretSet: false,
      clearingPlugin: null,
    })
    expect(s.ready).toBe(false)
    expect(s.hasOwnAccount).toBe(false)
    expect(s.message).toMatch(/חשבון משלו|מפתחות Morning משלו/)
  })

  it('is ready when enabled with own key + secret', () => {
    const s = buildCollectionsAccountStatus({
      enabled: true,
      apiKeyId: 'key-1',
      apiSecretSet: true,
      clearingPlugin: 'cardcom',
    })
    expect(s.ready).toBe(true)
    expect(s.hasOwnAccount).toBe(true)
    expect(s.checks.every((c) => !c.required || c.ok)).toBe(true)
  })

  it('has account but not ready when disabled', () => {
    const s = buildCollectionsAccountStatus({
      enabled: false,
      apiKeyId: 'key-1',
      apiSecretSet: true,
      clearingPlugin: null,
    })
    expect(s.hasOwnAccount).toBe(true)
    expect(s.ready).toBe(false)
  })
})

describe('assertTenantCanEnableMorning', () => {
  it('allows disable without keys', () => {
    expect(
      assertTenantCanEnableMorning({ enabled: false, apiKeyId: null, hasSecret: false }).ok
    ).toBe(true)
  })

  it('blocks enable without personal keys', () => {
    const r = assertTenantCanEnableMorning({
      enabled: true,
      apiKeyId: '',
      hasSecret: false,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/חשבון נפרד|מפתח/)
  })
})
