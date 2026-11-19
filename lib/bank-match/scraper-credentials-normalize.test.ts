import { describe, expect, it } from 'vitest'
import {
  normalizeOneZeroPhone,
  normalizeScraperCredentials,
} from '@/lib/bank-match/scraper-credentials-normalize'

describe('normalizeOneZeroPhone', () => {
  it('keeps E.164 with +', () => {
    expect(normalizeOneZeroPhone('+972541234567')).toBe('+972541234567')
  })

  it('adds + to 972…', () => {
    expect(normalizeOneZeroPhone('972541234567')).toBe('+972541234567')
  })

  it('converts local 05… to +972…', () => {
    expect(normalizeOneZeroPhone('054-123-4567')).toBe('+972541234567')
  })

  it('converts bare 5xxxxxxxx', () => {
    expect(normalizeOneZeroPhone('541234567')).toBe('+972541234567')
  })
})

describe('normalizeScraperCredentials', () => {
  it('normalizes only oneZero phoneNumber', () => {
    expect(
      normalizeScraperCredentials('oneZero', {
        email: 'a@b.com',
        password: 'x',
        phoneNumber: '0541234567',
      }).phoneNumber
    ).toBe('+972541234567')
    expect(
      normalizeScraperCredentials('leumi', {
        username: 'u',
        password: 'p',
        phoneNumber: '0541234567',
      }).phoneNumber
    ).toBe('0541234567')
  })
})
