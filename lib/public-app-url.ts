/**
 * Public app URL for SMS / deep links. Set NEXT_PUBLIC_APP_URL in .env.local and Vercel
 * (e.g. https://bamakor.vercel.app). Trimmed; trailing slash stripped before appending paths.
 */
function getPublicAppBaseUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
  if (!base) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set')
  }
  return base
}

/** Base URL when optional (e.g. ops alert emails). Empty if unset. */
export function getPublicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
}

export function getPublicTicketsUrl(): string {
  return `${getPublicAppBaseUrl()}/tickets`
}

/** Field worker personal area — no Google login; token saved in sessionStorage after first open. */
export function getWorkerPortalUrl(accessToken: string): string {
  const token = accessToken.trim().toLowerCase()
  return `${getPublicAppBaseUrl()}/worker?token=${encodeURIComponent(token)}`
}

/** Office entrance QR — scan with personal phone, pick name, clock in/out. */
export function getOfficeAttendanceScanUrl(stationToken: string): string {
  const st = stationToken.trim().toLowerCase()
  return `${getPublicAppBaseUrl()}/attendance/scan?st=${encodeURIComponent(st)}`
}
