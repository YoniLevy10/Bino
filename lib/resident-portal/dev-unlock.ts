/**
 * Private-server QA unlock for the resident portal.
 * Never active on production deploys — requires explicit env AND non-production runtime.
 */
export function isResidentPortalDevUnlocked(): boolean {
  if (process.env.RESIDENT_PORTAL_DEV_UNLOCK !== 'true') return false
  if (process.env.VERCEL_ENV === 'production') return false
  if (process.env.NODE_ENV === 'production') return false
  return true
}
