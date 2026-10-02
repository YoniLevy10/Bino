import { afterEach, describe, expect, it, vi } from 'vitest'
import { BINO_PUBLIC_ORIGIN } from '@/lib/public-origin'
import {
  getPublicAppUrl,
  getPublicPayUrl,
  getPublicTicketsUrl,
  getWorkerPortalUrl,
} from '@/lib/public-app-url'

describe('public-app-url', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds customer links from NEXT_PUBLIC_APP_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://bino.casa/')
    expect(getPublicAppUrl()).toBe('https://bino.casa')
    expect(getPublicTicketsUrl()).toBe('https://bino.casa/tickets')
    expect(getWorkerPortalUrl('AbC')).toBe('https://bino.casa/worker?token=abc')
    expect(getPublicPayUrl('tok-1')).toBe('https://bino.casa/pay/tok-1')
  })

  it('rejects vercel.app env and falls back to bino.casa', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://bamakor.vercel.app')
    expect(getPublicAppUrl()).toBe(BINO_PUBLIC_ORIGIN)
    expect(getPublicTicketsUrl()).toBe(`${BINO_PUBLIC_ORIGIN}/tickets`)
  })

  it('returns empty optional base when env is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    expect(getPublicAppUrl()).toBe('')
  })
})
