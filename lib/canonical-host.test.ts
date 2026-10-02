import { describe, expect, it } from 'vitest'
import {
  buildCanonicalRedirectUrl,
  isCanonicalHostPassthroughPath,
  shouldRedirectVercelAppHostToCanonical,
} from '@/lib/canonical-host'

describe('canonical-host', () => {
  it('passthrough keeps webhooks, crons, and well-known', () => {
    expect(isCanonicalHostPassthroughPath('/api/webhook/whatsapp')).toBe(true)
    expect(isCanonicalHostPassthroughPath('/api/webhook/grow')).toBe(true)
    expect(isCanonicalHostPassthroughPath('/api/cron/sla-check')).toBe(true)
    expect(isCanonicalHostPassthroughPath('/.well-known/apple-developer-merchantid-domain-association')).toBe(
      true
    )
    expect(isCanonicalHostPassthroughPath('/login')).toBe(false)
    expect(isCanonicalHostPassthroughPath('/')).toBe(false)
  })

  it('redirects production vercel.app hosts for app pages', () => {
    expect(
      shouldRedirectVercelAppHostToCanonical({
        host: 'bino-yonilevy10s-projects.vercel.app',
        pathname: '/',
        vercelEnv: 'production',
      })
    ).toBe(true)

    expect(
      shouldRedirectVercelAppHostToCanonical({
        host: 'bamakor.vercel.app',
        pathname: '/login',
        vercelEnv: 'production',
      })
    ).toBe(true)

    expect(
      shouldRedirectVercelAppHostToCanonical({
        host: 'bamakor.vercel.app',
        pathname: '/api/webhook/whatsapp',
        vercelEnv: 'production',
      })
    ).toBe(false)
  })

  it('does not redirect preview, localhost, or canonical host', () => {
    expect(
      shouldRedirectVercelAppHostToCanonical({
        host: 'bino-git-fix-login-yonilevy10s-projects.vercel.app',
        pathname: '/login',
        vercelEnv: 'preview',
      })
    ).toBe(false)

    expect(
      shouldRedirectVercelAppHostToCanonical({
        host: 'localhost:3000',
        pathname: '/login',
        vercelEnv: 'development',
        nodeEnv: 'development',
      })
    ).toBe(false)

    expect(
      shouldRedirectVercelAppHostToCanonical({
        host: 'bino.casa',
        pathname: '/login',
        vercelEnv: 'production',
      })
    ).toBe(false)
  })

  it('builds absolute bino.casa redirect URLs', () => {
    expect(buildCanonicalRedirectUrl({ pathname: '/', search: '' })).toBe('https://bino.casa')
    expect(buildCanonicalRedirectUrl({ pathname: '/login', search: '' })).toBe(
      'https://bino.casa/login'
    )
    expect(buildCanonicalRedirectUrl({ pathname: '/login', search: '?redirectTo=%2Fdashboard' })).toBe(
      'https://bino.casa/login?redirectTo=%2Fdashboard'
    )
  })
})
