import { describe, expect, it } from 'vitest'
import { satoriVisualRtl } from '@/lib/satori-rtl'

describe('satoriVisualRtl', () => {
  it('fully reverses Hebrew-only lines for Satori', () => {
    expect(satoriVisualRtl('זיכרון')).toBe('ןורכיז')
    expect(satoriVisualRtl('זיכרון תפעולי')).toBe('ילועפת ןורכיז')
  })

  it('keeps Latin and only reverses Hebrew runs when mixed', () => {
    expect(satoriVisualRtl('BINO זיכרון')).toBe('BINO ןורכיז')
  })
})
