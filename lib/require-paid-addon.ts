import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addonRequiredMessageHe,
  clientHasPaidAddon,
  getCatalogRowForAddon,
  type PaidAddonKey,
} from '@/lib/paid-addons'

export type RequirePaidAddonResult =
  | { ok: true }
  | { ok: false; response: NextResponse }

/** API routes: returns 403 if the tenant has not purchased the add-on. */
export async function requireClientPaidAddon(
  supabase: SupabaseClient,
  clientId: string,
  addonKey: PaidAddonKey
): Promise<RequirePaidAddonResult> {
  const has = await clientHasPaidAddon(supabase, clientId, addonKey)
  if (has) return { ok: true }

  const catalog = await getCatalogRowForAddon(supabase, addonKey)
  const nameHe = catalog?.name_he || addonKey
  const price = catalog?.price_ils_monthly ?? 0

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: addonRequiredMessageHe(nameHe, price),
        code: 'ADDON_REQUIRED',
        addon_key: addonKey,
        price_ils_monthly: price,
      },
      { status: 403 }
    ),
  }
}
