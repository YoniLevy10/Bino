import { NextResponse } from 'next/server'
import { readPalGateCredentialsStatus } from '@/lib/palgate/credentials'
import { requirePalGatePilotSession } from '@/lib/palgate/require-pilot'
import { resolvePalGatePilotClientId } from '@/lib/palgate/pilot'

export async function GET() {
  const auth = await requirePalGatePilotSession()
  if (!auth.ok) return auth.response

  const creds = readPalGateCredentialsStatus()
  return NextResponse.json({
    pilot: true,
    client_id: auth.ctx.clientId,
    pilot_client_id: resolvePalGatePilotClientId(),
    credentials: {
      configured: creds.configured,
      device_id_set: creds.deviceIdSet,
      phone_set: creds.phoneSet,
      token_set: creds.tokenSet,
      token_type: creds.tokenType,
      missing: creds.missing,
    },
  })
}
