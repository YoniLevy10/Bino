import { describe, expect, it } from 'vitest'
import { buildGrowInvoiceEmailBody } from '@/lib/collection-invoice-email'

describe('buildGrowInvoiceEmailBody', () => {
  it('includes invoice link and Hebrew subject', () => {
    const { subject, body } = buildGrowInvoiceEmailBody({
      title: 'דמי ועד',
      amount: 1,
      invoiceUrl: 'https://secure.meshulam.co.il/invoice/abc',
      invoiceId: '20',
      client_name: 'Bamakor',
      resident_name: 'ישראל',
      apartment_number: '3',
      project_name: 'הרצל 1',
    })
    expect(subject).toMatch(/חשבונית/)
    expect(subject).toMatch(/דמי ועד/)
    expect(body).toContain('https://secure.meshulam.co.il/invoice/abc')
    expect(body).toContain('מספר חשבונית: 20')
    expect(body).toContain('ישראל')
    expect(body).toContain('Bamakor')
  })
})
