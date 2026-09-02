/**
 * Resolve decrypted Meta user access token for an organization.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/mbrain/crypto'
import { getMetaMode } from '@/lib/mbrain/meta/client'

export async function getOrgMetaAccessToken(
  admin: SupabaseClient,
  organizationId: string
): Promise<string | null> {
  if (getMetaMode() === 'mock') return null

  const { data } = await admin
    .from('mbrain_meta_connections')
    .select('access_token_encrypted, status')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!data?.access_token_encrypted || data.status === 'disconnected') return null
  try {
    return decryptSecret(data.access_token_encrypted)
  } catch {
    return null
  }
}
