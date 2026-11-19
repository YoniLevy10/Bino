import { describe, expect, it } from 'vitest'
import {
  matchProjectName,
  normalizeProjectNameForMatch,
  parseResidentsDirectoryPdfText,
} from './parse-residents-directory-pdf'

describe('parse-residents-directory-pdf', () => {
  it('parses primary and spouse from a standard row', () => {
    const text = `מקור חיים 40 א
דירה\tשם\tטלפון\tאימייל\tבן זוג\tטלפון
1\tכהן סימון\t050-2377750\tmscohad@gmail.com
2\tאסואד מיקי\t054-6649957\tmichael.assuied@gmail.com\tאסואד דינה\t050-8900288`

    const rows = parseResidentsDirectoryPdfText(text)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      project_name: 'מקור חיים 40א',
      apartment_number: '1',
      full_name: 'כהן סימון',
      phone: '050-2377750',
      email: 'mscohad@gmail.com',
      is_renter: false,
    })
    expect(rows[2]).toMatchObject({
      full_name: 'אסואד דינה',
      apartment_number: '2',
      phone: '050-8900288',
    })
  })

  it('marks renters and stores owner in notes', () => {
    const text = `מקור חיים 40 א
דירה\tשם\tטלפון\tאימייל\tבן זוג\tטלפון\tשכירות\tבעל דירה\tטלפון\tאימייל
7\tרחל אפללו\t053-5554103\tMgmnt@si-trade.co.il\tשלומי אפללו\t053-5554105\tשכירות\tיהודה פחימה\t\tarikbu@bezeq.co.il`

    const rows = parseResidentsDirectoryPdfText(text)
    const rachel = rows.find((r) => r.full_name === 'רחל אפללו')
    expect(rachel?.is_renter).toBe(true)
    expect(rachel?.notes).toContain('יהודה פחימה')
    expect(rachel?.notes).toContain('arikbu@bezeq.co.il')
  })

  it('parses rows where שכירות is in the name column', () => {
    const text = `אביטל 13 ב
דירה\tשם\tטלפון
1\tשכירות\tאשר איטסר\t0505458817`

    const rows = parseResidentsDirectoryPdfText(text)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      full_name: 'אשר איטסר',
      phone: '0505458817',
      is_renter: true,
      apartment_number: '1',
    })
  })

  it('normalizes project names for matching', () => {
    expect(normalizeProjectNameForMatch('מקור חיים 40 א')).toBe('מקור חיים 40א')
    expect(normalizeProjectNameForMatch('אלרואי 5 א')).toBe('אלרואי 5א')
  })

  it('matches DB project names with spacing differences', () => {
    const db = [{ id: '1', name: 'מקור חיים 40ב' }]
    expect(matchProjectName('מקור חיים 40 ב', db)?.id).toBe('1')
    expect(matchProjectName('בוזגלו 4', [{ id: '2', name: 'בוזגלו 4' }])?.id).toBe('2')
  })
})
