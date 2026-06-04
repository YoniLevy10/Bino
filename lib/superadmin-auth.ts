/** Super Admin routes: x-admin-secret must match ADMIN_SETUP_SECRET. */
export function isSuperAdminAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET?.trim()
  if (!secret) return false
  return (req.headers.get('x-admin-secret') ?? '') === secret
}
