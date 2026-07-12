import { describe, it, expect } from 'vitest'
import {
  allowedMimeTypesForTicketAttachment,
  maxBytesForTicketAttachment,
  validateTicketAttachmentFile,
} from '@/lib/ticket-attachment-upload'

describe('ticket attachment upload validation', () => {
  it('allows web images and videos', () => {
    expect(allowedMimeTypesForTicketAttachment('web')).toContain('image/jpeg')
    expect(allowedMimeTypesForTicketAttachment('web')).toContain('video/mp4')
    expect(allowedMimeTypesForTicketAttachment('web')).toContain('application/pdf')
  })

  it('allows worker images only', () => {
    expect(allowedMimeTypesForTicketAttachment('worker')).toContain('image/jpeg')
    expect(allowedMimeTypesForTicketAttachment('worker')).not.toContain('video/mp4')
  })

  it('uses higher size limit for web video', () => {
    expect(maxBytesForTicketAttachment('video/mp4', 'web')).toBe(15 * 1024 * 1024)
    expect(maxBytesForTicketAttachment('image/jpeg', 'web')).toBe(5 * 1024 * 1024)
    expect(maxBytesForTicketAttachment('image/jpeg', 'worker')).toBe(5 * 1024 * 1024)
  })

  it('rejects unsupported worker video uploads', () => {
    const result = validateTicketAttachmentFile(
      { name: 'clip.mp4', type: 'video/mp4', size: 1024 },
      'worker'
    )
    expect(result.ok).toBe(false)
  })

  it('accepts valid web video uploads', () => {
    const result = validateTicketAttachmentFile(
      { name: 'clip.mp4', type: 'video/mp4', size: 2 * 1024 * 1024 },
      'web'
    )
    expect(result.ok).toBe(true)
  })

  it('rejects oversized web images', () => {
    const result = validateTicketAttachmentFile(
      { name: 'big.jpg', type: 'image/jpeg', size: 6 * 1024 * 1024 },
      'web'
    )
    expect(result.ok).toBe(false)
  })
})
