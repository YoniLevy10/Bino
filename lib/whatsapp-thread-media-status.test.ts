import { describe, it, expect } from 'vitest'
import { threadHasUnrecoveredMedia } from './whatsapp-thread-media-status'

describe('threadHasUnrecoveredMedia', () => {
  it('detects missing video when thread has video message', () => {
    expect(
      threadHasUnrecoveredMedia(
        [{ direction: 'in', message_type: 'video' }],
        []
      )
    ).toBe(true)
  })

  it('is false when video attachment exists', () => {
    expect(
      threadHasUnrecoveredMedia(
        [{ direction: 'in', message_type: 'video' }],
        [{ mime_type: 'video/mp4', attachment_type: 'whatsapp_video' }]
      )
    ).toBe(false)
  })

  it('detects missing image when only video is attached', () => {
    expect(
      threadHasUnrecoveredMedia(
        [
          { direction: 'in', message_type: 'video' },
          { direction: 'in', message_type: 'image' },
        ],
        [{ mime_type: 'video/mp4', attachment_type: 'whatsapp_video' }]
      )
    ).toBe(true)
  })
})
