import { describe, it, expect } from 'vitest'
import {
  buildWhatsAppMessageMediaPayload,
  mergeWhatsAppInteractivePayload,
  parseWhatsAppMessageMediaPayload,
} from './whatsapp-message-media'

describe('whatsapp-message-media', () => {
  it('stores and parses video media ref', () => {
    const payload = mergeWhatsAppInteractivePayload(null, 'meta-vid-1', 'video')
    expect(parseWhatsAppMessageMediaPayload(payload)).toEqual({
      mediaId: 'meta-vid-1',
      kind: 'video',
    })
  })

  it('merges with existing interactive payload', () => {
    const payload = mergeWhatsAppInteractivePayload({ reply_id: 'x' }, 'img-1', 'image')
    expect(payload?.reply_id).toBe('x')
    expect(buildWhatsAppMessageMediaPayload('img-1', 'image')).toMatchObject({
      whatsapp_media_id: 'img-1',
      whatsapp_media_kind: 'image',
    })
  })
})
