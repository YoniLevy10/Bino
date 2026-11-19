/** Matches CSS `max-width: 768px` for mobile layout. */
export const MOBILE_BREAKPOINT_PX = 768

export function getIsMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= MOBILE_BREAKPOINT_PX
}
