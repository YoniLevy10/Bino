import { afterEach, describe, expect, it, vi } from 'vitest'
import { isResidentPortalDevUnlocked } from '@/lib/resident-portal/dev-unlock'

describe('isResidentPortalDevUnlocked', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is false by default', () => {
    vi.stubEnv('RESIDENT_PORTAL_DEV_UNLOCK', '')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VERCEL_ENV', '')
    expect(isResidentPortalDevUnlocked()).toBe(false)
  })

  it('is true only with unlock flag in development', () => {
    vi.stubEnv('RESIDENT_PORTAL_DEV_UNLOCK', 'true')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VERCEL_ENV', '')
    expect(isResidentPortalDevUnlocked()).toBe(true)
  })

  it('stays false in NODE_ENV=production even with unlock flag', () => {
    vi.stubEnv('RESIDENT_PORTAL_DEV_UNLOCK', 'true')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', '')
    expect(isResidentPortalDevUnlocked()).toBe(false)
  })

  it('stays false when VERCEL_ENV=production', () => {
    vi.stubEnv('RESIDENT_PORTAL_DEV_UNLOCK', 'true')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(isResidentPortalDevUnlocked()).toBe(false)
  })
})
