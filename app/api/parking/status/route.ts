import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  readPalGateCredentialsStatus,
  readPalGateCredentialsStatusFromRow,
} from '@/lib/palgate/credentials'
import type { ClientPalGateRow } from '@/lib/palgate/access'
import { requirePalGatePilotSession } from '@/lib/palgate/require-pilot'
import { isPalGatePilotClient, resolvePalGatePilotClientIds } from '@/lib/palgate/pilot'

export async function GET() {
  const auth = await requirePalGatePilotSession()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from('clients')
    .select(
      'palgate_enabled, palgate_device_id, palgate_phone_number, palgate_session_token_hex, palgate_token_type, palgate_base_url'
    )
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  const dbStatus = readPalGateCredentialsStatusFromRow(data as ClientPalGateRow | null)
  const envStatus = readPalGateCredentialsStatus()
  const fromDb = dbStatus.configured
  const creds = fromDb ? dbStatus : envStatus
  const pilotIds = resolvePalGatePilotClientIds()

  return NextResponse.json({
    pilot: isPalGatePilotClient(auth.ctx.clientId) || fromDb,
    client_id: auth.ctx.clientId,
    pilot_client_id: pilotIds[0],
    pilot_client_ids: pilotIds,
    credentials: {
      configured: creds.configured,
      device_id_set: creds.deviceIdSet,
      phone_set: creds.phoneSet,
      token_set: creds.tokenSet,
      token_type: creds.tokenType,
      missing: creds.missing,
      source: creds.source,
    },
  })
}
