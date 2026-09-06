import { describe, expect, it } from 'vitest'
import { formatLegalPhoneDisplay, getLegalSiteConfig, legalTelHref } from '@/lib/legal-site-config'

describe('formatLegalPhoneDisplay', () => {
  it('formats 972 to local 0…', () => {
    expect(formatLegalPhoneDisplay('972559899132')).toBe('0559899132')
  })
})

describe('legalTelHref', () => {
  it('builds tel link', () => {
    expect(legalTelHref('0559899132')).toBe('tel:+972559899132')
  })
})

describe('getLegalSiteConfig', () => {
  it('returns defaults without LEGAL_* env', () => {
    const prevName = process.env.LEGAL_BUSINESS_NAME
    const prevPhone = process.env.LEGAL_PHONE
    const prevAddress = process.env.LEGAL_ADDRESS
    delete process.env.LEGAL_BUSINESS_NAME
    delete process.env.LEGAL_PHONE
    delete process.env.LEGAL_ADDRESS

    const cfg = getLegalSiteConfig()
    expect(cfg.businessName).toBe('Bino')
    expect(cfg.readyForGrowAudit).toBe(false)
    // No hardcoded legacy brand email — empty until LEGAL_EMAIL / RESEND_FROM_EMAIL is set
    expect(cfg.email.includes('bamakor')).toBe(false)

    if (prevName !== undefined) process.env.LEGAL_BUSINESS_NAME = prevName
    if (prevPhone !== undefined) process.env.LEGAL_PHONE = prevPhone
    if (prevAddress !== undefined) process.env.LEGAL_ADDRESS = prevAddress
  })

  it('is ready when phone and address set', () => {
    process.env.LEGAL_BUSINESS_NAME = 'Bino ניהול'
    process.env.LEGAL_PHONE = '0501234567'
    process.env.LEGAL_ADDRESS = 'רחוב הרצל 1, תל אביב'
    const cfg = getLegalSiteConfig()
    expect(cfg.readyForGrowAudit).toBe(true)
    expect(cfg.businessName).toBe('Bino ניהול')
    expect(cfg.phoneDisplay).toMatch(/050/)
  })
})
