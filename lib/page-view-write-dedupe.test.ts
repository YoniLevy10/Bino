import { describe, expect, it } from 'vitest'
import {
  pageViewDedupeKey,
  rememberPageView,
  resetPageViewWriteDedupeForTests,
  shouldRecordPageView,
  PAGE_VIEW_DEDUP_MS,
} from './page-view-write-dedupe'

describe('page view write dedupe', () => {
  it('records the first hit and drops a repeat inside the window', () => {
    resetPageViewWriteDedupeForTests()
    const key = pageViewDedupeKey('client', 'user', 'tickets', '/tickets')
    const now = 1_700_000_000_000
    expect(shouldRecordPageView(key, now)).toBe(true)
    rememberPageView(key, now)
    expect(shouldRecordPageView(key, now + 60_000)).toBe(false)
    expect(shouldRecordPageView(key, now + PAGE_VIEW_DEDUP_MS)).toBe(true)
  })
})
