import { describe, expect, it } from 'vitest'
import { normalizeChecklistItems, toggleChecklistItem } from './maintenance-checklist'

describe('maintenance-checklist', () => {
  it('normalizes valid items and drops invalid', () => {
    const items = normalizeChecklistItems([
      { id: 'a', text: 'בדיקה', done_at: null },
      { id: '', text: 'bad', done_at: null },
      { junk: true },
    ])
    expect(items).toEqual([{ id: 'a', text: 'בדיקה', done_at: null }])
  })

  it('toggles done_at', () => {
    const base = [{ id: 'a', text: 'x', done_at: null }]
    const done = toggleChecklistItem(base, 'a', true, '2026-01-01T00:00:00.000Z')
    expect(done[0].done_at).toBe('2026-01-01T00:00:00.000Z')
    const undone = toggleChecklistItem(done, 'a', false)
    expect(undone[0].done_at).toBeNull()
  })
})
