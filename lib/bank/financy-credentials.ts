import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isFinancyCredentialsComplete,
  type FinancyCredentials,
} from '@/lib/bank/financy-auth'

export type ClientFinancyRow = {
  financy_enabled: boolean | null
  financy_client_id: string | null
  financy_client_secret: string | null
  financy_user_id: string | null
}

export async function loadClientFinancyCredentials(
  admin: SupabaseClient,
  clientId: string
): Promise<
  | { ok: true; enabled: boolean; creds: FinancyCredentials | null; row: ClientFinancyRow }
  | { ok: false; error: string }
> {
  const { data, error } = await admin
    .from('clients')
    .select(
      'financy_enabled, financy_client_id, financy_client_secret, financy_user_id'
    )
    .eq('id', clientId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'client not found' }

  const row = data as ClientFinancyRow
  const partial = {
    clientId: row.financy_client_id || '',
    clientSecret: row.financy_client_secret || '',
    userId: row.financy_user_id || '',
  }
  const creds = isFinancyCredentialsComplete(partial) ? partial : null
  return {
    ok: true,
    enabled: row.financy_enabled === true,
    creds,
    row,
  }
}

export function financySettingsUrl(): string {
  return 'https://financy.open-finance.ai/settings'
}
