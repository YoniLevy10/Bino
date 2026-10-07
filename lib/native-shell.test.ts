import { describe, expect, it } from 'vitest'
import { googleOAuthRedirect, isAllowedOAuthURL, isBinoIosShell } from '@/lib/native-shell'

describe('native iOS shell oauth', () => {
  it('keeps the browser on the https callback', () => {
    expect(googleOAuthRedirect('/dashboard', 'https://bino.casa', false)).toEqual({
      redirectTo: 'https://bino.casa/auth/callback?next=%2Fdashboard',
      skipBrowserRedirect: false,
    })
  })

  it('uses the app URL scheme inside the iOS shell', () => {
    expect(googleOAuthRedirect('/calendar?gcal=1', 'https://bino.casa/', true)).toEqual({
      redirectTo: 'bino://auth/callback?next=%2Fcalendar%3Fgcal%3D1',
      skipBrowserRedirect: true,
    })
  })

  it('rejects off-site next paths', () => {
    expect(googleOAuthRedirect('https://evil.example', 'https://bino.casa', false).redirectTo).toBe(
      'https://bino.casa/auth/callback?next=%2Fdashboard',
    )
  })

  it('allows only Google and Supabase authorize URLs', () => {
    expect(isAllowedOAuthURL('https://abc.supabase.co/auth/v1/authorize?provider=google')).toBe(true)
    expect(isAllowedOAuthURL('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true)
    expect(isAllowedOAuthURL('https://bino.casa/login')).toBe(false)
    expect(isAllowedOAuthURL('http://abc.supabase.co/auth/v1/authorize')).toBe(false)
    expect(isAllowedOAuthURL('not a url')).toBe(false)
  })

  it('is not the shell under vitest', () => {
    expect(isBinoIosShell()).toBe(false)
  })
})
