/** True for the field-worker portal routes (`/worker`, `/worker/...`). */
export function isWorkerPortalPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname === '/worker' || pathname.startsWith('/worker/')
}
