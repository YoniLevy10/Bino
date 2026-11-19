import { describe, expect, it } from 'vitest'
import {
  clientHash,
  launchNewHash,
  onboardingHash,
  parseSuperadminHash,
} from '@/app/superadmin/hashRoute'

describe('parseSuperadminHash', () => {
  it('parses launch wizard and onboarding steps', () => {
    expect(parseSuperadminHash('#launch/new')).toEqual({ kind: 'launch_new', step: 1 })
    expect(parseSuperadminHash('#launch/3')).toEqual({ kind: 'launch_new', step: 3 })
    expect(parseSuperadminHash('#client/abc/onboarding/5')).toEqual({
      kind: 'client',
      clientId: 'abc',
      task: 'onboarding',
      launchStep: 5,
    })
  })

  it('keeps legacy client tasks', () => {
    expect(parseSuperadminHash('#client/abc/launch')).toEqual({
      kind: 'client',
      clientId: 'abc',
      task: 'launch',
    })
  })

  it('builds hashes', () => {
    expect(launchNewHash(1)).toBe('#launch/new')
    expect(onboardingHash('x', 4)).toBe('#client/x/onboarding/4')
    expect(clientHash('x', 'hub')).toBe('#client/x')
  })
})
