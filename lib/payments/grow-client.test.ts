import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveGrowTransaction,
  buildGrowInvoiceNotifyUrl,
  getGrowTransactionInfo,
  isGrowApiSuccessStatus,
  parseGrowPaymentLinkResponse,
  parseGrowTransactionInfoResponse,
} from '@/lib/payments/grow-client'
import {
  isGrowGetTransactionInfoEnabled,
  parseGrowEnv,
  readGrowPlatformConfig,
  sanitizeGrowPlainText,
} from '@/lib/payments/grow-config'

vi.mock('@/lib/shared/fetch-timeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

import { fetchWithTimeout } from '@/lib/shared/fetch-timeout'

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

describe('buildGrowInvoiceNotifyUrl', () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL
  const prevSite = process.env.NEXT_PUBLIC_SITE_URL
  const prevSecret = process.env.GROW_WEBHOOK_SECRET

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = prevApp
    process.env.NEXT_PUBLIC_SITE_URL = prevSite
    process.env.GROW_WEBHOOK_SECRET = prevSecret
  })

  it('builds bino.casa invoice webhook URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://bino.casa'
    process.env.GROW_WEBHOOK_SECRET = 'hook-secret'
    expect(buildGrowInvoiceNotifyUrl()).toBe(
      'https://bino.casa/api/webhook/grow-invoice?token=hook-secret'
    )
  })

  it('refuses *.vercel.app APP_URL and falls back to canonical host', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://bamakor.vercel.app'
    delete process.env.NEXT_PUBLIC_SITE_URL
    process.env.GROW_WEBHOOK_SECRET = 'hook-secret'
    expect(buildGrowInvoiceNotifyUrl()).toBe(
      'https://bino.casa/api/webhook/grow-invoice?token=hook-secret'
    )
  })
})

describe('isGrowGetTransactionInfoEnabled', () => {
  it('defaults off; accepts 1/true/on/yes', () => {
    expect(isGrowGetTransactionInfoEnabled(undefined)).toBe(false)
    expect(isGrowGetTransactionInfoEnabled('')).toBe(false)
    expect(isGrowGetTransactionInfoEnabled('0')).toBe(false)
    expect(isGrowGetTransactionInfoEnabled('1')).toBe(true)
    expect(isGrowGetTransactionInfoEnabled('true')).toBe(true)
    expect(isGrowGetTransactionInfoEnabled('ON')).toBe(true)
  })
})

describe('parseGrowTransactionInfoResponse', () => {
  it('parses flat data shape as paid', () => {
    const parsed = parseGrowTransactionInfoResponse({
      status: 1,
      data: {
        status: 'שולם',
        statusCode: 2,
        sum: '50',
        transactionId: '33500000',
        transactionToken: 'tok',
        processId: '5000000',
        paymentLinkProcessId: '355555',
        asmachta: '300000209',
      },
    })
    expect(parsed).toMatchObject({
      paid: true,
      sum: '50',
      transactionId: '33500000',
      asmachta: '300000209',
    })
  })

  it('parses transactions[] shape', () => {
    const parsed = parseGrowTransactionInfoResponse({
      status: '1',
      data: {
        processId: '123',
        transactions: [{ statusCode: '2', status: 'שולם', sum: '3', transactionId: '9' }],
      },
    })
    expect(parsed?.paid).toBe(true)
    expect(parsed?.sum).toBe('3')
    expect(parsed?.transactionId).toBe('9')
    expect(parsed?.processId).toBe('123')
  })

  it('rejects non-success status', () => {
    expect(parseGrowTransactionInfoResponse({ status: 0, data: { statusCode: 2 } })).toBeNull()
  })
})

describe('getGrowTransactionInfo', () => {
  const platform = {
    env: 'sandbox' as const,
    apiKey: 'body-key',
    xApiKey: 'header-key',
    pageCode: 'page',
    walletPageCode: 'page',
    webhookSecret: 'hook',
  }
  const prevFlag = process.env.GROW_GET_TRANSACTION_INFO_ENABLED

  beforeEach(() => {
    vi.mocked(fetchWithTimeout).mockReset()
  })

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.GROW_GET_TRANSACTION_INFO_ENABLED
    else process.env.GROW_GET_TRANSACTION_INFO_ENABLED = prevFlag
  })

  it('does not call Grow when feature flag is off', async () => {
    delete process.env.GROW_GET_TRANSACTION_INFO_ENABLED
    const result = await getGrowTransactionInfo(
      { transactionId: 'tx-1', transactionToken: 'tok-1' },
      platform
    )
    expect(result).toEqual({
      ok: false,
      error: 'getTransactionInfo כבוי (GROW_GET_TRANSACTION_INFO_ENABLED)',
      code: 'DISABLED',
    })
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('posts /getTransactionInfo when flag enabled', async () => {
    process.env.GROW_GET_TRANSACTION_INFO_ENABLED = 'true'
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        status: 1,
        data: { statusCode: 2, status: 'שולם', sum: '10', transactionId: 'tx-1' },
      }),
    } as Response)

    const result = await getGrowTransactionInfo(
      { transactionId: 'tx-1', transactionToken: 'tok-1' },
      platform
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.paid).toBe(true)
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    const [url] = vi.mocked(fetchWithTimeout).mock.calls[0]
    expect(String(url)).toContain('/getTransactionInfo')
  })
})
