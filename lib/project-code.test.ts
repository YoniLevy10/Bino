import { describe, expect, it } from 'vitest'
import { nextBmkProjectCode } from '@/lib/project-code'

describe('nextBmkProjectCode', () => {
  it('starts at BMK1 when nothing exists', () => {
    expect(nextBmkProjectCode([])).toBe('BMK1')
  })

  it('continues after the highest BMK number', () => {
    expect(nextBmkProjectCode(['BMK1', 'BMK21', 'BMK7'])).toBe('BMK22')
  })

  it('ignores padded and non-numeric codes when a higher plain number exists', () => {
    expect(nextBmkProjectCode(['BMK001', 'BMK21', 'BMK10ABC', 'START_BMK4'])).toBe('BMK22')
  })

  it('treats BMK001 as 1', () => {
    expect(nextBmkProjectCode(['bmk001'])).toBe('BMK2')
  })
})
