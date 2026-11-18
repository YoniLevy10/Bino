import { NextResponse } from 'next/server'
import {
  requireSessionClientIdLite,
  requireSessionWriteAccess,
} from '@/lib/api-auth'
import { isPalGatePilotClient } from '@/lib/palgate/pilot'

export function palGatePilotForbiddenResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'פיילוט חניונים / PalGate זמין רק ללקוח סביון',
      code: 'PALGATE_PILOT_ONLY',
    },
    { status: 403 }
  )
}

/** Read routes — session + Savion hard gate. */
export async function requirePalGatePilotSession() {
  const auth = await requireSessionClientIdLite()
  if (!auth.ok) return auth
  if (!isPalGatePilotClient(auth.ctx.clientId)) {
    return { ok: false as const, response: palGatePilotForbiddenResponse() }
  }
  return auth
}

/** Mutating routes — write role + Savion hard gate. */
export async function requirePalGatePilotWrite() {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth
  if (!isPalGatePilotClient(auth.ctx.clientId)) {
    return { ok: false as const, response: palGatePilotForbiddenResponse() }
  }
  return auth
}
