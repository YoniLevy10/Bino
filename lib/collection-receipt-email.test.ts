import { describe, expect, it } from 'vitest'
import {
  buildPaymentReceiptEmailBody,
  normalizeReceiptEmail,
} from '@/lib/collection-receipt-email'

describe('normalizeReceiptEmail', () => {
  it('accepts valid emails', () => {
    expect(normalizeReceiptEmail('  Foo@Bar.com ')).toBe('foo@bar.com')
  })

  it('rejects invalid', () => {
    expect(normalizeReceiptEmail('')).toBeNull()
    expect(normalizeReceiptEmail('not-an-email')).toBeNull()
  })
})

describe('buildPaymentReceiptEmailBody', () => {
  it('includes amount and title in Hebrew', () => {
    const { subject, body } = buildPaymentReceiptEmailBody({
      id: '1',
      title: 'ועד בית',
      amount: 350,
      currency: 'ILS',
      paid_at: '2026-08-21T10:00:00.000Z',
      receipt_email: 'a@b.com',
      receipt_email_sent_at: null,
      client_name: 'Bino ניהול',
      resident_name: 'ישראל',
      apartment_number: '12',
      project_name: 'הרצל 5',
    })
    expect(subject).toMatch(/ועד בית/)
    expect(body).toMatch(/ישראל/)
    expect(body).toMatch(/דירה: 12/)
    expect(body).toMatch(/Bino ניהול/)
    expect(body).toMatch(/אישור תשלום|התקבל תשלום/)
  })
})
