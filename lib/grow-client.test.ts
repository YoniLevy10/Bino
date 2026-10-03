import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveGrowTransaction,
  isGrowApiSuccessStatus,
  parseGrowPaymentLinkResponse,
} from '@/lib/grow-client'
import { parseGrowEnv, readGrowPlatformConfig, sanitizeGrowPlainText } from '@/lib/grow-config'

vi.mock('@/lib/fetch-timeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

import { fetchWithTimeout } from '@/lib/fetch-timeout'

describe('parseGrowEnv', () => {
  it('defaults to production unless sandbox', () => {
    expect(parseGrowEnv(undefined)).toBe('production')
    expect(parseGrowEnv('')).toBe('production')
    expect(parseGrowEnv('production')).toBe('production')
    expect(parseGrowEnv('sandbox')).toBe('sandbox')
  })
})

describe('readGrowPlatformConfig', () => {
  const keys = ['GROW_API_KEY', 'GROW_X_API_KEY', 'GROW_PAGE_CODE', 'GROW_WEBHOOK_SECRET', 'GROW_ENV'] as const
  const prev: Partial<Record<(typeof keys)[number], string | undefined>> = {}

  afterEach(() => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
      delete prev[key]
    }
  })

  function stash() {
    for (const key of keys) prev[key] = process.env[key]
  }

  it('requires body apiKey, header x-api-key, pageCode, webhook secret', () => {
    stash()
    process.env.GROW_API_KEY = 'body-key'
    process.env.GROW_X_API_KEY = 'header-key'
    process.env.GROW_PAGE_CODE = 'page'
    process.env.GROW_WEBHOOK_SECRET = 'hook'
    process.env.GROW_ENV = 'sandbox'
    expect(readGrowPlatformConfig()).toEqual({
      env: 'sandbox',
      apiKey: 'body-key',
      xApiKey: 'header-key',
      pageCode: 'page',
      walletPageCode: 'page',
      webhookSecret: 'hook',
    })
  })

  it('falls back to GROW_API_KEY for x-api-key when GROW_X_API_KEY unset', () => {
    stash()
    process.env.GROW_API_KEY = 'same-key'
    delete process.env.GROW_X_API_KEY
    process.env.GROW_PAGE_CODE = 'page'
    process.env.GROW_WEBHOOK_SECRET = 'hook'
    delete process.env.GROW_ENV
    expect(readGrowPlatformConfig()?.xApiKey).toBe('same-key')
  })
})

describe('sanitizeGrowPlainText', () => {
  it('strips Grow-rejected symbols and collapses spaces', () => {
    expect(sanitizeGrowPlainText('ועד <בית> #1 & "דירה"')).toBe('ועד בית 1 דירה')
  })
})

describe('parseGrowPaymentLinkResponse', () => {
  it('reads nested data.url and process id', () => {
    const parsed = parseGrowPaymentLinkResponse({
      status: 1,
      data: {
        url: 'https://secure.meshulam.co.il/pay/abc',
        paymentLinkProcessId: 99,
        paymentLinkProcessToken: 'tok',
      },
    })
    expect(parsed).toEqual({
      url: 'https://secure.meshulam.co.il/pay/abc',
      paymentLinkProcessId: '99',
      paymentLinkProcessToken: 'tok',
    })
  })

  it('rejects non-success status', () => {
    expect(
      parseGrowPaymentLinkResponse({
        status: 0,
        err: 'bad',
        data: { url: 'https://secure.meshulam.co.il/pay/abc' },
      })
    ).toBeNull()
  })
})

describe('isGrowApiSuccessStatus', () => {
  it('accepts only numeric/string 1', () => {
    expect(isGrowApiSuccessStatus(1)).toBe(true)
    expect(isGrowApiSuccessStatus('1')).toBe(true)
    expect(isGrowApiSuccessStatus(0)).toBe(false)
    expect(isGrowApiSuccessStatus('0')).toBe(false)
    expect(isGrowApiSuccessStatus(200)).toBe(false)
    expect(isGrowApiSuccessStatus(undefined)).toBe(false)
  })
})

describe('approveGrowTransaction', () => {
  const platform = {
    env: 'sandbox' as const,
    apiKey: 'body-key',
    xApiKey: 'header-key',
    pageCode: 'page',
    walletPageCode: 'page',
    webhookSecret: 'hook',
  }

  beforeEach(() => {
    vi.mocked(fetchWithTimeout).mockReset()
  })

  it('fails when HTTP 200 but body status is not 1', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ status: 0, err: 'reject' }),
    } as Response)

    const result = await approveGrowTransaction(
      {
        transactionId: 'tx-1',
        transactionToken: 'tok-1',
      },
      platform
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('succeeds only when body status is 1', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ status: 1, data: {} }),
    } as Response)

    const result = await approveGrowTransaction(
      {
        transactionId: 'tx-1',
        transactionToken: 'tok-1',
      },
      platform
    )
    expect(result).toEqual({ ok: true })
  })
})
