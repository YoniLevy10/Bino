import { describe, expect, it } from 'vitest'
import { patchSiteTourManagerNotesBodySchema } from '@/lib/api-body-schemas'

describe('patchSiteTourManagerNotesBodySchema', () => {
  it('accepts a note string', () => {
    const parsed = patchSiteTourManagerNotesBodySchema.safeParse({
      manager_notes: 'לבדוק מעלית שוב מחר',
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts null to clear', () => {
    const parsed = patchSiteTourManagerNotesBodySchema.safeParse({
      manager_notes: null,
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects notes over 2000 chars', () => {
    const parsed = patchSiteTourManagerNotesBodySchema.safeParse({
      manager_notes: 'א'.repeat(2001),
    })
    expect(parsed.success).toBe(false)
  })
})
