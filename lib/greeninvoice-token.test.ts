import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/fetch-timeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { obtainGreenInvoiceToken } from '@/lib/greeninvoice-client'
import {
  greenInvoiceBaseUrl,
  greenInvoiceIdpTokenUrl,
  looksLikeUrlAsApiKeyId,
} from '@/lib/greeninvoice-config'
import {
  formatGreenInvoiceAuthError,
  parseGreenInvoiceTokenResponse,
  pickGreenInvoiceAuthMessage,
  safeGreenInvoiceAuthLog,
} from '@/lib/greeninvoice-token'

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Morning token URLs', () => {
  it('uses the June 2026 IdP hosts, not /account/token', () => {
    expect(greenInvoiceIdpTokenUrl('production')).toBe('https://api.morning.co/idp/v1/oauth/token')
    expect(greenInvoiceIdpTokenUrl('sandbox')).toBe('https://api.sandbox.morning.dev/idp/v1/oauth/token')
    expect(greenInvoiceBaseUrl('production')).toBe('https://api.greeninvoice.co.il/api/v1')
    expect(greenInvoiceBaseUrl('sandbox')).toBe('https://sandbox.d.greeninvoice.co.il/api/v1')
  })
})

describe('looksLikeUrlAsApiKeyId', () => {
  it('rejects dashboard URLs and accepts a UUID key id', () => {
    expect(looksLikeUrlAsApiKeyId('https://bamakor-dashboard.vercel.app/superadmin')).toBe(true)
    expect(looksLikeUrlAsApiKeyId('bamakor.vercel.app/superadmin')).toBe(true)
    expect(looksLikeUrlAsApiKeyId('  11111111-1111-1111-1111-111111111111  ')).toBe(false)
  })
})

describe('parseGreenInvoiceTokenResponse', () => {
  it('reads OAuth camelCase (accessToken / expiresAt)', () => {
    const parsed = parseGreenInvoiceTokenResponse({
      accessToken: 'idp-token',
      tokenType: 'Bearer',
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
    expect(parsed?.token).toBe('idp-token')
    expect(parsed?.expires).toBe(Date.parse('2099-01-01T00:00:00.000Z') / 1000)
  })

  it('reads RFC snake_case and legacy /account/token', () => {
    expect(parseGreenInvoiceTokenResponse({ access_token: 'rfc', expires_in: 3600 })?.token).toBe('rfc')
    expect(parseGreenInvoiceTokenResponse({ token: 'legacy', expires: 1_700_000_000 })).toEqual({
      token: 'legacy',
      expires: 1_700_000_000,
    })
    expect(parseGreenInvoiceTokenResponse({ errorCode: 401 })).toBeNull()
  })
})

describe('formatGreenInvoiceAuthError', () => {
  it('prefers Morning Hebrew message and maps invalid_client', () => {
    expect(formatGreenInvoiceAuthError({ errorCode: 401, errorMessage: 'גישה נדחתה, נא להתחבר מחדש' })).toBe(
      'גישה נדחתה, נא להתחבר מחדש'
    )
    expect(formatGreenInvoiceAuthError({ error: 'invalid_client' })).toBe('מפתח או סוד שגויים')
    expect(
      pickGreenInvoiceAuthMessage({ error: 'invalid_client' }, { errorMessage: 'גישה נדחתה, נא להתחבר מחדש' })
    ).toBe('גישה נדחתה, נא להתחבר מחדש')
  })

  it('strips tokens from log payloads', () => {
    expect(
      safeGreenInvoiceAuthLog({
        error: 'invalid_client',
        accessToken: 'secret-token',
        client_secret: 'nope',
      })
    ).toEqual({ error: 'invalid_client' })
  })
})

describe('obtainGreenInvoiceToken', () => {
  afterEach(() => {
    vi.mocked(fetchWithTimeout).mockReset()
  })

  const creds = {
    env: 'production' as const,
    apiKeyId: '11111111-1111-1111-1111-111111111111',
    apiSecret: 'test-secret',
  }

  it('rejects a URL pasted as Key ID without calling Morning', async () => {
    const result = await obtainGreenInvoiceToken({
      ...creds,
      apiKeyId: 'https://bamakor-dashboard.vercel.app/superadmin',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/כתובת אתר/)
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('uses the IdP token when OAuth succeeds', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonRes(200, { accessToken: 'oauth-ok', expiresAt: '2099-01-01T00:00:00.000Z' })
    )

    const result = await obtainGreenInvoiceToken(creds)
    expect(result).toMatchObject({ ok: true, token: 'oauth-ok' })
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchWithTimeout).mock.calls[0][0]).toBe(
      'https://api.morning.co/idp/v1/oauth/token'
    )
    const body = JSON.parse(String(vi.mocked(fetchWithTimeout).mock.calls[0][1]?.body))
    expect(body).toEqual({
      grant_type: 'client_credentials',
      client_id: creds.apiKeyId,
      client_secret: creds.apiSecret,
    })
  })

  it('falls back to retired /account/token when IdP rejects', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(jsonRes(401, { error: 'invalid_client' }))
      .mockResolvedValueOnce(jsonRes(200, { token: 'legacy-ok', expires: 1_700_000_000 }))

    const result = await obtainGreenInvoiceToken(creds)
    expect(result).toEqual({ ok: true, token: 'legacy-ok', expires: 1_700_000_000 })
    expect(vi.mocked(fetchWithTimeout).mock.calls[1][0]).toBe(
      'https://api.greeninvoice.co.il/api/v1/account/token'
    )
  })

  it('surfaces Morning Hebrew 401 instead of a generic auth failure', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(jsonRes(401, { error: 'invalid_client' }))
      .mockResolvedValueOnce(
        jsonRes(401, { errorCode: 401, errorMessage: 'גישה נדחתה, נא להתחבר מחדש' })
      )

    const result = await obtainGreenInvoiceToken(creds)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('גישה נדחתה, נא להתחבר מחדש')
      expect(result.error).toMatch(/ייצור/)
      expect(result.errorCode).toBe(401)
    }
  })
})
