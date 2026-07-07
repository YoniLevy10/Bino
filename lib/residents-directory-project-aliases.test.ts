import { describe, expect, it } from 'vitest'
import { matchProjectName } from './parse-residents-directory-pdf'
import { matchNormForPdfProject } from './residents-directory-project-aliases'

describe('residents-directory-project-aliases', () => {
  it('maps מקור חיים 37 to קוואדרה DB name for matching', () => {
    const db = [{ id: '1', name: 'קוואדרה- קוואדרה 37' }]
    expect(matchProjectName('מקור חיים 37', db)?.id).toBe('1')
    expect(matchNormForPdfProject('מקור חיים 37')).toBe(
      matchNormForPdfProject('קוואדרה- קוואדרה 37')
    )
  })
})
