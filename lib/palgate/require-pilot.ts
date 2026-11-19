import { NextResponse } from 'next/server'
import {
  requireSessionClientIdLite,
  requireSessionWriteAccess,
} from '@/lib/auth-api/api-auth'
import { isPalGateAccessAllowed } from '@/lib/palgate/access'

export function palGatePilotForbiddenResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'חניונים / PalGate לא מופעל ללקוח זה',
      code: 'PALGATE_PILOT_ONLY',
    },
    { status: 403 }
  )
}

/** Read routes — session + PalGate access (allowlist or DB credentials). */
export async function requirePalGatePilotSession() {
  const auth = await requireSessionClientIdLite()
  if (!auth.ok) return auth
  const allowed = await isPalGateAccessAllowed(auth.ctx.admin, auth.ctx.clientId)
  if (!allowed) {
    return { ok: false as const, response: palGatePilotForbiddenResponse() }
  }
  return auth
}

/** Mutating routes — write role + PalGate access. */
export async function requirePalGatePilotWrite() {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth
  const allowed = await isPalGateAccessAllowed(auth.ctx.admin, auth.ctx.clientId)
  if (!allowed) {
    return { ok: false as const, response: palGatePilotForbiddenResponse() }
  }
  return auth
}
