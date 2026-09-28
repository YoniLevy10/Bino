import { describe, expect, it } from 'vitest'
import {
  residentSafeDescription,
  residentSafeTitle,
} from '@/lib/resident-safe-description'

describe('residentSafeDescription', () => {
  it('keeps normal resident-facing notes', () => {
    expect(residentSafeDescription('דמי ועד לחודש מרץ')).toBe('דמי ועד לחודש מרץ')
  })

  it('hides internal ops / test notes', () => {
    expect(residentSafeDescription('שלב 3 — callback + Approve')).toBeNull()
    expect(residentSafeDescription('בדיקת webhook sandbox')).toBeNull()
    expect(residentSafeDescription('GetLink userId')).toBeNull()
  })

  it('treats empty as null', () => {
    expect(residentSafeDescription(null)).toBeNull()
    expect(residentSafeDescription('   ')).toBeNull()
  })
})

describe('residentSafeTitle', () => {
  it('keeps normal titles', () => {
    expect(residentSafeTitle('דמי ועד')).toBe('דמי ועד')
  })

  it('replaces internal test titles', () => {
    expect(residentSafeTitle('בדיקת שרשרת BINO')).toBe('חיוב לתשלום')
    expect(residentSafeTitle('בדיקת כרטיס אשראי Grow')).toBe('חיוב לתשלום')
  })
})
