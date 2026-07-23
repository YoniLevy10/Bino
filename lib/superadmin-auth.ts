import { NextResponse } from 'next/server'
import { secureStringEqual } from '@/lib/secure-compare'

/** Super Admin routes: x-admin-secret must match ADMIN_SETUP_SECRET. */
export function isSuperAdminAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET?.trim()
  if (!secret) return false
  const provided = (req.headers.get('x-admin-secret') ?? '').trim()
  if (!provided) return false
  return secureStringEqual(provided, secret)
}

/** Alias used by several superadmin API routes. */
export function isSuperAdminRequest(req: Request): boolean {
  return isSuperAdminAuthorized(req)
}

export function superAdminUnauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
