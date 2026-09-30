import { describe, expect, it } from 'vitest'
import { extractGrowInvoiceWebhookFields } from '@/lib/grow-invoice-webhook'

describe('extractGrowInvoiceWebhookFields', () => {
  it('parses documented Grow invoice webhook shape', () => {
    const fields = extractGrowInvoiceWebhookFields({
      transactionCode: 'ABCD1234',
      invoiceNumber: '20',
      invoiceUrl: 'https://secure.meshulam.co.il/inv/20',
    })
    expect(fields.transactionId).toBe('ABCD1234')
    expect(fields.invoiceId).toBe('20')
    expect(fields.invoiceUrl).toContain('meshulam')
    expect(fields.documentType).toBeNull()
  })

  it('reads nested data + customFields.cField1 and document type', () => {
    const fields = extractGrowInvoiceWebhookFields({
      data: {
        invoiceNumber: '99',
        invoiceUrl: 'https://example.com/doc.pdf',
        documentType: 'חשבונית מס / קבלה',
        customFields: { cField1: 'b5744aac-c654-47c0-b13e-23e940a0eeae' },
        paymentLinkProcessId: '71587',
      },
    })
    expect(fields.publicToken).toBe('b5744aac-c654-47c0-b13e-23e940a0eeae')
    expect(fields.processId).toBe('71587')
    expect(fields.invoiceId).toBe('99')
    expect(fields.documentType).toBe('חשבונית מס / קבלה')
  })
})
