import type { SupabaseClient } from '@supabase/supabase-js'

/** Stable keys for paid add-ons — add new keys here when shipping features. */
export const PAID_ADDON_KEYS = {
  /** יומן משרד — פגישות, ועדות, קישור לפרויקטים */
  calendar: 'calendar',
  professionals: 'professionals',
  /** חתמת עובדים — נוכחות QR/NFC, offline sync */
  worker_stamp: 'worker_stamp',
  /** SMS פתיחת פיילוט לכל דיירי הבניין */
  pilot_sms: 'pilot_sms',
  /** ארכיון מסמכים לפי פרויקט */
  project_documents: 'project_documents',
} as const

export type PaidAddonKey = (typeof PAID_ADDON_KEYS)[keyof typeof PAID_ADDON_KEYS]

export type PaidAddonCatalogRow = {
  addon_key: string
  name_he: string
  description_he: string | null
  price_ils_monthly: number
  is_active: boolean
  sort_order: number
}

/** Tenant entitlement row returned by /api/addons/entitlements */
export type AddonEntitlement = PaidAddonCatalogRow & {
  enabled: boolean
}

export function formatAddonPriceIls(price: number): string {
  return `₪${price.toLocaleString('he-IL')}`
}

export function addonRequiredMessageHe(nameHe: string, priceIls: number): string {
  return `התוסף "${nameHe}" אינו פעיל בחשבון שלכם. מחיר: ${formatAddonPriceIls(priceIls)}/חודש — פנו לבמקור להפעלה.`
}

export async function listActiveAddonsCatalog(
  supabase: SupabaseClient
): Promise<PaidAddonCatalogRow[]> {
  const { data, error } = await supabase
    .from('paid_addons_catalog')
    .select('addon_key, name_he, description_he, price_ils_monthly, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data as PaidAddonCatalogRow[]) || []
}

export async function listAllAddonsCatalogAdmin(
  supabase: SupabaseClient
): Promise<PaidAddonCatalogRow[]> {
  const { data, error } = await supabase
    .from('paid_addons_catalog')
    .select('addon_key, name_he, description_he, price_ils_monthly, is_active, sort_order')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data as PaidAddonCatalogRow[]) || []
}

export async function getClientEnabledAddonKeys(
  supabase: SupabaseClient,
  clientId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('client_paid_addons')
    .select('addon_key')
    .eq('client_id', clientId)
    .eq('enabled', true)

  if (error) throw error
  return new Set((data || []).map((r) => (r as { addon_key: string }).addon_key))
}

export async function clientHasPaidAddon(
  supabase: SupabaseClient,
  clientId: string,
  addonKey: PaidAddonKey | string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('client_paid_addons')
    .select('addon_key')
    .eq('client_id', clientId)
    .eq('addon_key', addonKey)
    .eq('enabled', true)
    .maybeSingle()

  if (error) throw error
  return !!data
}

export async function getCatalogRowForAddon(
  supabase: SupabaseClient,
  addonKey: string
): Promise<PaidAddonCatalogRow | null> {
  const { data, error } = await supabase
    .from('paid_addons_catalog')
    .select('addon_key, name_he, description_he, price_ils_monthly, is_active, sort_order')
    .eq('addon_key', addonKey)
    .maybeSingle()

  if (error) throw error
  return (data as PaidAddonCatalogRow | null) ?? null
}
