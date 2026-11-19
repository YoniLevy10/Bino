/**
 * PalGate / parking access: legacy env pilot allowlist OR per-client DB credentials.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPalGatePilotClient } from '@/lib/palgate/pilot'

export type ClientPalGateRow = {
  palgate_enabled?: boolean | null
  palgate_device_id?: string | null
  palgate_phone_number?: string | null
  palgate_session_token_hex?: string | null
  palgate_token_type?: string | null
  palgate_base_url?: string | null
}

export function clientRowHasPalGateCredentials(row: ClientPalGateRow | null | undefined): boolean {
  if (!row || row.palgate_enabled !== true) return false
  const device = (row.palgate_device_id || '').trim()
  const phone = (row.palgate_phone_number || '').trim()
  const token = (row.palgate_session_token_hex || '').trim()
  const tokenType = (row.palgate_token_type || '').trim()
  return Boolean(device && phone && token && tokenType)
}

/** Sync allowlist check — middleware fast path / tests. */
export function isPalGateAllowlistedClient(clientId: string | null | undefined): boolean {
  return isPalGatePilotClient(clientId)
}

/**
 * Full access gate: allowlist OR DB-enabled credentials.
 * Bound query: single client id.
 */
export async function isPalGateAccessAllowed(
  admin: SupabaseClient,
  clientId: string | null | undefined
): Promise<boolean> {
  const id = typeof clientId === 'string' ? clientId.trim() : ''
  if (!id) return false
  if (isPalGatePilotClient(id)) return true

  const { data, error } = await admin
    .from('clients')
    .select(
      'palgate_enabled, palgate_device_id, palgate_phone_number, palgate_session_token_hex, palgate_token_type'
    )
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return false
  return clientRowHasPalGateCredentials(data as ClientPalGateRow)
}
