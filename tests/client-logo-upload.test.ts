import { describe, expect, it } from 'vitest'
import { resolveClientLogoMime, validateClientLogoFile } from '@/lib/client-logo-upload'

describe('client-logo-upload', () => {
  it('infers jpeg from file name when browser sends empty type', () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], { type: '' })
    expect(resolveClientLogoMime(blob, 'logo.jpg')).toBe('image/jpeg')
  })

  it('infers png from magic bytes', () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const blob = new Blob([bytes], { type: 'application/octet-stream' })
    expect(resolveClientLogoMime(blob, 'upload.bin', bytes)).toBe('image/png')
  })

  it('rejects unknown mime', () => {
    const blob = new Blob(['x'], { type: 'text/plain' })
    expect(validateClientLogoFile(1, resolveClientLogoMime(blob, 'notes.txt'))).toMatch(/לא נתמך/)
  })
})
