import { describe, expect, it } from 'vitest'
import {
  collectionsBulkSendToastMessage,
  collectionsSmsToastMessage,
} from '@/lib/collections-notify-toast'

describe('collectionsSmsToastMessage', () => {
  it('returns success when sms_sent is true', () => {
    expect(
      collectionsSmsToastMessage({
        smsSent: true,
        successMessage: 'החיוב נוצר ונשלח',
        smsFailedMessage: 'החיוב נוצר, אך SMS לא נשלח',
      })
    ).toEqual({ type: 'success', message: 'החיוב נוצר ונשלח' })
  })

  it('returns warning when sms_sent is false', () => {
    expect(
      collectionsSmsToastMessage({
        smsSent: false,
        successMessage: 'נשלח לתשלום',
        smsFailedMessage: 'החיוב מוכן לתשלום, אך SMS לא נשלח',
      })
    ).toEqual({
      type: 'warning',
      message: 'החיוב מוכן לתשלום, אך SMS לא נשלח',
    })
  })

  it('returns warning when sms_sent is missing after a send attempt', () => {
    expect(
      collectionsSmsToastMessage({
        smsSent: undefined,
        successMessage: 'SMS נשלח מחדש',
        smsFailedMessage: 'לא הצלחנו לשלוח SMS מחדש',
      }).type
    ).toBe('warning')
  })
})

describe('collectionsBulkSendToastMessage', () => {
  it('returns success only when failed is 0', () => {
    expect(
      collectionsBulkSendToastMessage({ created: 3, sent: 3, failed: 0 })
    ).toEqual({
      type: 'success',
      message: 'השליחה המרוכזת הושלמה — נוצרו 3 · נשלחו 3 · נכשלו 0',
    })
  })

  it('returns warning for partial failure', () => {
    expect(
      collectionsBulkSendToastMessage({ created: 5, sent: 3, failed: 2 })
    ).toEqual({
      type: 'warning',
      message: 'שליחה חלקית — נוצרו 5 · נשלחו 3 · נכשלו 2',
    })
  })

  it('returns error when all sends failed', () => {
    expect(
      collectionsBulkSendToastMessage({ created: 2, sent: 0, failed: 2 })
    ).toEqual({
      type: 'error',
      message: 'השליחה נכשלה — נוצרו 2 · נשלחו 0 · נכשלו 2',
    })
  })

  it('never claims full success when failed > 0', () => {
    const kinds = [
      collectionsBulkSendToastMessage({ created: 1, sent: 0, failed: 1 }).type,
      collectionsBulkSendToastMessage({ created: 4, sent: 1, failed: 3 }).type,
      collectionsBulkSendToastMessage({ created: 10, sent: 9, failed: 1 }).type,
    ]
    expect(kinds.every((k) => k !== 'success')).toBe(true)
  })
})
