import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  CLIENT_GROW_LEGAL_SELECT,
  isClientGrowPageId,
  type ClientGrowLegalRow,
} from '@/lib/client-grow-legal'

/** Public Grow page load — legal fields only, never Morning keys. */
export const loadPublicGrowMerchant = cache(async function loadPublicGrowMerchant(
  clientId: string
): Promise<ClientGrowLegalRow | null> {
  if (!isClientGrowPageId(clientId)) return null
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('clients')
    .select(CLIENT_GROW_LEGAL_SELECT)
    .eq('id', clientId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as ClientGrowLegalRow
  if (row.is_active === false) return null
  return row
})
