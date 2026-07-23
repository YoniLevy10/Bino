import { describe, expect, it } from 'vitest'
import {
  buildResidentIntakePath,
  buildResidentIntakeShareMessage,
  buildResidentIntakeUrl,
  buildResidentIntakeWhatsAppShareUrl,
} from '@/lib/resident-intake'

describe('resident intake helpers', () => {
  it('builds path with uppercase project code', () => {
    expect(buildResidentIntakePath('bld01', 'client-uuid')).toBe(
      '/intake?project=BLD01&client=client-uuid'
    )
  })

  it('builds absolute url from base', () => {
    expect(
      buildResidentIntakeUrl({
        projectCode: 'A1',
        clientId: 'c1',
        baseUrl: 'https://bamakor.vercel.app/',
      })
    ).toBe('https://bamakor.vercel.app/intake?project=A1&client=c1')
  })

  it('share message is plain Hebrew without emoji and includes url', () => {
    const msg = buildResidentIntakeShareMessage({
      projectName: 'הרצל 12',
      intakeUrl: 'https://bamakor.vercel.app/intake?project=H12&client=c1',
    })
    expect(msg).toContain('הרצל 12')
    expect(msg).toContain('https://bamakor.vercel.app/intake?project=H12&client=c1')
    expect(msg).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('builds wa.me share url without phone (group picker)', () => {
    const url = buildResidentIntakeWhatsAppShareUrl('שלום\nhttps://example.com')
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(url.split('text=')[1] || '')).toContain('https://example.com')
  })
})
