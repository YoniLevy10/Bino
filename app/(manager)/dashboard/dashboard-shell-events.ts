const ADD_EVENT = 'bino:dashboard-add-ticket'
const PENDING_KEY = 'bino:dashboard-add-ticket-pending'

/** Ask the deferred dashboard body to open the new-ticket modal. */
export function requestDashboardAddTicket() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(PENDING_KEY, '1')
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(ADD_EVENT))
}

export function consumeDashboardAddTicket(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const pending = sessionStorage.getItem(PENDING_KEY) === '1'
    if (pending) sessionStorage.removeItem(PENDING_KEY)
    return pending
  } catch {
    return false
  }
}

export const DASHBOARD_ADD_EVENT = ADD_EVENT