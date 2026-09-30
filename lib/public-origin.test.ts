import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BINO_PUBLIC_ORIGIN,
  getClientPublicOrigin,
  getEnvPublicOrigin,
  getResidentPortalJoinUrl,
  isVercelAppOrigin,
} from '@/lib/public-origin'

describe('public-origin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('detects vercel.app hosts', () => {
    expect(isVercelAppOrigin('https://bamakor.vercel.app')).toBe(true)
    expect(isVercelAppOrigin('https://bino-git-main.vercel.app')).toBe(true)
    expect(isVercelAppOrigin('https://bino.casa')).toBe(false)
    expect(isVercelAppOrigin('http://localhost:3000')).toBe(false)
  })

  it('prefers NEXT_PUBLIC_APP_URL over anything else', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://bino.casa/')
    expect(getEnvPublicOrigin()).toBe('https://bino.casa')
    expect(getClientPublicOrigin()).toBe('https://bino.casa')
    expect(getResidentPortalJoinUrl('proj-1')).toBe('https://bino.casa/resident/join/proj-1')
  })

  it('rejects vercel.app in env and falls back to bino.casa', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://bamakor.vercel.app')
    expect(getEnvPublicOrigin()).toBe('')
    expect(getClientPublicOrigin()).toBe(BINO_PUBLIC_ORIGIN)
  })
})
