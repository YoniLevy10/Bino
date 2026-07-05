/** Global pull-to-refresh / manual reload signal for client pages. */

export const APP_REFRESH_EVENT = 'bamakor:app-refresh'

export function dispatchAppRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(APP_REFRESH_EVENT))
}
