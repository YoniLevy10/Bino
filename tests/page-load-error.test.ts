import { describe, expect, it } from 'vitest'
import { shouldShowPageLoadError } from '@/lib/page-load-error'

describe('shouldShowPageLoadError', () => {
  it('clears error after a successful fetch', () => {
    expect(
      shouldShowPageLoadError({ fetchSucceeded: true, silent: false, hasDataToShow: false })
    ).toBe(false)
    expect(
      shouldShowPageLoadError({ fetchSucceeded: true, silent: true, hasDataToShow: true })
    ).toBe(false)
  })

  it('shows error on initial load failure with no data', () => {
    expect(
      shouldShowPageLoadError({ fetchSucceeded: false, silent: false, hasDataToShow: false })
    ).toBe(true)
  })

  it('keeps cached dashboard visible when silent refresh fails', () => {
    expect(
      shouldShowPageLoadError({ fetchSucceeded: false, silent: true, hasDataToShow: true })
    ).toBe(false)
  })

  it('shows error when silent refresh fails and there is nothing to show', () => {
    expect(
      shouldShowPageLoadError({ fetchSucceeded: false, silent: true, hasDataToShow: false })
    ).toBe(true)
  })
})
