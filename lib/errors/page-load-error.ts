/**
 * Full-page error vs silent refresh:
 * never replace already-painted cached data with a fake "offline" screen
 * when a background refresh fails (common after mobile app resume).
 */
export function shouldShowPageLoadError(options: {
  fetchSucceeded: boolean
  silent: boolean
  hasDataToShow: boolean
}): boolean {
  if (options.fetchSucceeded) return false
  if (options.silent && options.hasDataToShow) return false
  return true
}
