import { describe, it, expect } from 'vitest'
import { isAddressLikeText, parseIncomingWhatsAppMessage } from './whatsapp-parser'

describe('isAddressLikeText — problem descriptions must not trigger building search', () => {
  it('short two-word Hebrew problem (user report) is not address-like', () => {
    expect(isAddressLikeText('עט כחול')).toBe(false)
  })

  it('three-word problem description is not mistaken for street search', () => {
    expect(isAddressLikeText('דלת לא נסגרת')).toBe(false)
  })

  it('single nickname token 3–40 letters can be address-like (product rule)', () => {
    expect(isAddressLikeText('חלץ')).toBe(true)
  })

  it('street-style Hebrew phrase with sufficient length is address-like', () => {
    expect(isAddressLikeText('רחוב הרצל כהן תל אביב')).toBe(true)
  })

  it('digits imply address/building hint', () => {
    expect(isAddressLikeText('מקור חיים 12')).toBe(true)
  })

  it('address cues are address-like', () => {
    expect(isAddressLikeText('בניין 5 דירה 3')).toBe(true)
  })
})

describe('parseIncomingWhatsAppMessage — Meta unsupported placeholder', () => {
  it('parses type=unsupported with Meta error code 131060', () => {
    const parsed = parseIncomingWhatsAppMessage({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pnid-1' },
                messages: [
                  {
                    from: '972501234567',
                    id: 'wamid.unsupported1',
                    timestamp: '1750090702',
                    type: 'unsupported',
                    errors: [{ code: 131060, title: 'Unavailable' }],
                  },
                ],
              },
            },
          ],
        },
      ],
    })
    expect(parsed?.messageType).toBe('unsupported')
    expect(parsed?.unsupportedErrorCode).toBe(131060)
  })

  it('parses video media id for follow-up webhook', () => {
    const parsed = parseIncomingWhatsAppMessage({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pnid-1' },
                messages: [
                  {
                    from: '972501234567',
                    id: 'wamid.vid1',
                    type: 'video',
                    video: { id: 'meta-video-123', caption: 'נזילה בממטרה' },
                  },
                ],
              },
            },
          ],
        },
      ],
    })
    expect(parsed?.messageType).toBe('video')
    expect(parsed?.mediaId).toBe('meta-video-123')
    expect(parsed?.mediaType).toBe('video')
    expect(parsed?.textBody).toBe('נזילה בממטרה')
  })
})
