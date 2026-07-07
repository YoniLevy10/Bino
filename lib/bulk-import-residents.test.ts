import { describe, expect, it } from 'vitest'
import { suggestProjectCodeForImport } from './bulk-import-residents'

describe('suggestProjectCodeForImport', () => {
  it('generates unique codes from project name', () => {
    const codes = new Set<string>()
    const a = suggestProjectCodeForImport('חלץ 10', codes)
    const b = suggestProjectCodeForImport('חלץ 12', codes)
    expect(a).toMatch(/^BMK10[A-Z0-9]{3}$/)
    expect(b).toMatch(/^BMK12[A-Z0-9]{3}$/)
    expect(a).not.toBe(b)
  })

  it('includes Hebrew letter suffix', () => {
    const codes = new Set<string>()
    expect(suggestProjectCodeForImport('אלרואי 5א', codes)).toMatch(/^BMK5A/)
    expect(suggestProjectCodeForImport('מקור חיים 40ב', codes)).toMatch(/^BMK40B/)
  })

  it('avoids collisions with numeric suffix', () => {
    const codes = new Set<string>(['BMK10ABC'])
    const next = suggestProjectCodeForImport('חלץ 10', codes)
    expect(next).not.toBe('BMK10ABC')
    expect(codes.has(next)).toBe(true)
  })
})
