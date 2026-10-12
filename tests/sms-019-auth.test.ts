import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/fetch-timeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

import { fetchWithTimeout } from '@/lib/fetch-timeout'
import {
  build019SmsXml,
  get019SmsAuth,
  is019SmsConfigured,
  post019SmsOnce,
  read019SmsTokenFromEnv,
  reset019SmsPasswordFallbackWarnForTests,
} from '@/lib/sms-019-core'

describe('019SMS token auth', () => {
  const keys = [
    'SMS_019_USERNAME',
    'SMS_019_TOKEN',
    'SMS_019_API_TOKEN',
    'SMS_019_PASSWORD',
  ] as const
  const prev: Partial<Record<(typeof keys)[number], string | undefined>> = {}

  beforeEach(() => {
    for (const key of keys) prev[key] = process.env[key]
    for (const key of keys) delete process.env[key]
    reset019SmsPasswordFallbackWarnForTests()
    vi.mocked(fetchWithTimeout).mockReset()
  })

  afterEach(() => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  })

  it('prefers SMS_019_TOKEN over password', () => {
    const auth = get019SmsAuth({
      SMS_019_USERNAME: 'user1',
      SMS_019_TOKEN: 'tok-abc',
      SMS_019_PASSWORD: 'secret',
    })
    expect(auth).toEqual({ mode: 'token', username: 'user1', token: 'tok-abc' })
    expect(is019SmsConfigured({ SMS_019_USERNAME: 'user1', SMS_019_TOKEN: 'tok-abc' })).toBe(true)
  })

  it('accepts SMS_019_API_TOKEN alias', () => {
    expect(read019SmsTokenFromEnv({ SMS_019_API_TOKEN: 'alias-tok' })).toBe('alias-tok')
    const auth = get019SmsAuth({
      SMS_019_USERNAME: 'user1',
      SMS_019_API_TOKEN: 'alias-tok',
    })
    expect(auth).toEqual({ mode: 'token', username: 'user1', token: 'alias-tok' })
  })

  it('falls back to password when token missing', () => {
    const auth = get019SmsAuth({
      SMS_019_USERNAME: 'user1',
      SMS_019_PASSWORD: 'secret',
    })
    expect(auth).toEqual({ mode: 'password', username: 'user1', password: 'secret' })
  })

  it('builds XML without password for token mode and with Bearer header on send', async () => {
    process.env.SMS_019_USERNAME = 'user1'
    process.env.SMS_019_TOKEN = 'tok-abc'

    const xml = build019SmsXml(
      { mode: 'token', username: 'user1', token: 'tok-abc' },
      '972559899132',
      '972501234567',
      'שלום'
    )
    expect(xml).toContain('<username>user1</username>')
    expect(xml).not.toContain('<password>')
    expect(xml).toContain('<phone>972501234567</phone>')

    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<status>0</status><message>OK</message>',
    } as Response)

    const result = await post019SmsOnce('972501234567', 'שלום', '972559899132')
    expect(result.ok).toBe(true)
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    const [, init] = vi.mocked(fetchWithTimeout).mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok-abc',
      'Content-Type': 'application/xml; charset=UTF-8',
    })
    expect(String((init as RequestInit).body)).not.toContain('<password>')
  })

  it('legacy password mode still sends password in XML without Authorization', async () => {
    process.env.SMS_019_USERNAME = 'user1'
    process.env.SMS_019_PASSWORD = 'secret'

    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<status>0</status><message>OK</message>',
    } as Response)

    const result = await post019SmsOnce('972501234567', 'שלום', '972559899132')
    expect(result.ok).toBe(true)
    const [, init] = vi.mocked(fetchWithTimeout).mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
    expect(String((init as RequestInit).body)).toContain('<password>secret</password>')
  })
})
