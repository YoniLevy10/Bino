import { describe, expect, it } from 'vitest'
import {
  getClientGrowContactPath,
  getClientGrowPagePath,
  getClientGrowPageUrl,
  growLegalFromClientRow,
  growLegalToSiteConfig,
  isClientGrowPageId,
  isGrowLegalReady,
  resolveGrowBusinessName,
} from '@/lib/client-grow-legal'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

describe('isClientGrowPageId', () => {
  it('accepts a uuid', () => {
    expect(isClientGrowPageId(CLIENT_ID)).toBe(true)
  })

  it('rejects slug or empty', () => {
    expect(isClientGrowPageId('sarah')).toBe(false)
    expect(isClientGrowPageId('')).toBe(false)
  })
})

describe('growLegalFromClientRow', () => {
  it('is not ready without phone and address', () => {
    const legal = growLegalFromClientRow({
      id: CLIENT_ID,
      name: 'שרה ניהול',
      grow_legal_business_name: null,
      grow_legal_phone: null,
      grow_legal_address: null,
      grow_legal_email: null,
    })
    expect(legal.businessName).toBe('שרה ניהול')
    expect(legal.ready).toBe(false)
    expect(isGrowLegalReady(legal)).toBe(false)
  })

  it('is ready when name + phone + address are set', () => {
    const legal = growLegalFromClientRow({
      id: CLIENT_ID,
      name: 'Bino',
      grow_legal_business_name: 'שרה ניהול בע״מ',
      grow_legal_phone: '0501234567',
      grow_legal_address: 'הרצל 1, תל אביב',
      grow_legal_email: 'sarah@example.com',
    })
    expect(legal.ready).toBe(true)
    expect(legal.businessName).toBe('שרה ניהול בע״מ')
    expect(growLegalToSiteConfig(legal).readyForGrowAudit).toBe(true)
    expect(growLegalToSiteConfig(legal).phoneDisplay).toMatch(/050/)
  })
})

describe('resolveGrowBusinessName', () => {
  it('prefers explicit legal name', () => {
    expect(
      resolveGrowBusinessName({
        id: CLIENT_ID,
        name: 'Bino',
        grow_legal_business_name: 'חברת שרה',
      })
    ).toBe('חברת שרה')
  })
})

describe('grow page urls', () => {
  it('builds public paths from client id', () => {
    expect(getClientGrowPagePath(CLIENT_ID)).toBe(`/vaad-pay/${CLIENT_ID}`)
    expect(getClientGrowContactPath(CLIENT_ID)).toBe(`/vaad-pay/${CLIENT_ID}/contact`)
    expect(getClientGrowPageUrl(CLIENT_ID)).toMatch(/\/vaad-pay\/11111111-1111-4111-8111-111111111111$/)
  })
})
