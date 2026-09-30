/** True for resident portal routes (`/resident`, `/resident/...`). */
export function isResidentPortalPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname === '/resident' || pathname.startsWith('/resident/')
}

/** True for resident portal API routes. */
export function isResidentPortalApiPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname === '/api/resident' || pathname.startsWith('/api/resident/')
}
