import { navIdsForEnabledAddonKeys } from '@/lib/paid-addons'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ADDON_ONLY_SIDEBAR_NAV_IDS,
  isInternalSidebarNavItemId,
  isSidebarNavItemId,
  SIDEBAR_NAV_ITEM_IDS,
  SIDEBAR_NAV_REGISTRY,
  type SidebarNavItem,
  type SidebarNavItemId,
} from '@/lib/sidebar-nav'

/** Always on — cannot be disabled from superadmin. */
export const REQUIRED_NAV_FEATURE_IDS: readonly SidebarNavItemId[] = [
  'dashboard',
  'tickets',
]

/** Paid add-ons — not in sidebar; not in setup package (~10k NIS). */
export const PREMIUM_NAV_FEATURE_IDS: readonly SidebarNavItemId[] = ADDON_ONLY_SIDEBAR_NAV_IDS

/**
 * Default allowlist for new clients (setup / onboarding).
 * Includes free tools that are not top-level sidebar items (QR, templates, pending).
 */
export const SETUP_PACKAGE_NAV_FEATURE_IDS: readonly SidebarNavItemId[] = [
  'dashboard',
  'tasks',
  'tickets',
  'projects',
  'residents',
  'workers',
  'site_tours',
  'summary',
  'qr',
  'whatsapp_templates',
  'pending_residents',
]

export function getSetupPackageNavFeatures(): SidebarNavItemId[] {
  return [...SETUP_PACKAGE_NAV_FEATURE_IDS]
}

export function parseEnabledNavFeaturesFromDb(value: unknown): SidebarNavItemId[] | null {
  if (value == null) return null
  if (!Array.isArray(value)) return null
  const ids: SidebarNavItemId[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string' || isInternalSidebarNavItemId(entry)) continue
    if (!isSidebarNavItemId(entry) || seen.has(entry)) continue
    seen.add(entry)
    ids.push(entry)
  }
  for (const required of REQUIRED_NAV_FEATURE_IDS) {
    if (!seen.has(required)) ids.unshift(required)
  }
  return ids.length > 0 ? ids : null
}

/**
 * null = legacy unlimited (existing tenants — never auto-restricted).
 * Non-null array = explicit allowlist (new setup package or superadmin).
 */
export function isLegacyUnlimitedNavFeatures(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): boolean {
  return enabledFeatures == null
}

export function isSetupPackageNavFeatures(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): boolean {
  if (!enabledFeatures?.length) return false
  const allowed = new Set(enabledFeatures)
  if (SETUP_PACKAGE_NAV_FEATURE_IDS.some((id) => !allowed.has(id))) return false
  for (const premium of PREMIUM_NAV_FEATURE_IDS) {
    if (allowed.has(premium)) return false
  }
  return enabledFeatures.length === SETUP_PACKAGE_NAV_FEATURE_IDS.length
}

export type ClientNavFeaturesMode = 'legacy_unlimited' | 'setup_package' | 'custom_restricted'

export function describeClientNavFeaturesMode(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): ClientNavFeaturesMode {
  if (isLegacyUnlimitedNavFeatures(enabledFeatures)) return 'legacy_unlimited'
  if (isSetupPackageNavFeatures(enabledFeatures)) return 'setup_package'
  return 'custom_restricted'
}

/** null = all features enabled (legacy tenants only). */
export function isNavFeatureEnabled(
  enabledFeatures: SidebarNavItemId[] | null | undefined,
  featureId: SidebarNavItemId
): boolean {
  if (!enabledFeatures || enabledFeatures.length === 0) return true
  return enabledFeatures.includes(featureId)
}

export function filterNavItemsByEnabledFeatures(
  items: SidebarNavItem[],
  enabledFeatures: SidebarNavItemId[] | null | undefined
): SidebarNavItem[] {
  if (!enabledFeatures || enabledFeatures.length === 0) return items
  const allowed = new Set(enabledFeatures)
  return items.filter((item) => item.id !== 'addons' && allowed.has(item.id as SidebarNavItemId))
}

export function resolveEnabledNavFeaturesForClient(
  enabledFromDb: SidebarNavItemId[] | null | undefined
): SidebarNavItemId[] | null {
  if (!enabledFromDb) return null
  const seen = new Set<SidebarNavItemId>()
  const result: SidebarNavItemId[] = []
  for (const id of enabledFromDb) {
    if (!isSidebarNavItemId(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  for (const required of REQUIRED_NAV_FEATURE_IDS) {
    if (!seen.has(required)) result.unshift(required)
  }
  return result
}

const PATH_TO_NAV_ID: Record<string, SidebarNavItemId> = {
  '/dashboard': 'dashboard',
  '/tickets': 'tickets',
  '/projects': 'projects',
  '/residents': 'residents',
  '/workers': 'workers',
  '/summary': 'summary',
  '/calendar': 'calendar',
  '/attendance': 'attendance',
  '/professionals': 'professionals',
  '/pilot-sms': 'pilot_sms',
  '/project-documents': 'project_documents',
  '/whatsapp-inbox': 'whatsapp_inbox',
  '/campaigns': 'campaigns',
  '/collections': 'collections',
  '/qr': 'qr',
  '/settings/whatsapp-templates': 'whatsapp_templates',
  '/pending-residents': 'pending_residents',
}

export function navItemIdForPathname(pathname: string): SidebarNavItemId | null {
  if (pathname in PATH_TO_NAV_ID) return PATH_TO_NAV_ID[pathname]
  if (pathname.startsWith('/settings/whatsapp-templates')) return 'whatsapp_templates'
  return null
}

export function normalizeEnabledNavFeaturesPayload(
  ids: string[]
): { ok: true; value: SidebarNavItemId[] } | { ok: false; error: string } {
  const parsed = parseEnabledNavFeaturesFromDb(ids)
  if (!parsed?.length) {
    return { ok: false, error: 'נדרש לפחות לשונית אחת' }
  }
  for (const required of REQUIRED_NAV_FEATURE_IDS) {
    if (!parsed.includes(required)) {
      return { ok: false, error: 'לוח בקרה ותקלות חייבים להישאר פעילים' }
    }
  }
  return { ok: true, value: parsed }
}

export async function fetchClientEnabledNavFeatures(
  admin: SupabaseClient,
  clientId: string
): Promise<SidebarNavItemId[] | null> {
  const { data, error } = await admin
    .from('clients')
    .select('enabled_nav_features')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return parseEnabledNavFeaturesFromDb(
    (data as { enabled_nav_features?: unknown } | null)?.enabled_nav_features
  )
}

export async function assertClientNavFeatureEnabled(
  admin: SupabaseClient,
  clientId: string,
  featureId: SidebarNavItemId
): Promise<NextResponse | null> {
  const enabled = await fetchClientEnabledNavFeatures(admin, clientId)
  if (isNavFeatureEnabled(enabled, featureId)) return null
  return NextResponse.json(
    { error: "פיצ'ר בתשלום. ליצירת קשר: הנהלת Levy Tech." },
    { status: 403 }
  )
}

export function allNavFeatureOptions(): { id: SidebarNavItemId; label: string }[] {
  return SIDEBAR_NAV_ITEM_IDS.filter((id) => !isInternalSidebarNavItemId(id)).map((id) => ({
    id,
    label: SIDEBAR_NAV_REGISTRY[id].label,
  }))
}

/** Core tabs only — premium add-ons are managed via client_paid_addons in superadmin. */
export function coreNavFeatureOptions(): { id: SidebarNavItemId; label: string }[] {
  const premium = new Set<string>(PREMIUM_NAV_FEATURE_IDS)
  return allNavFeatureOptions().filter(({ id }) => !premium.has(id))
}

export function mergePremiumNavFeaturesForSync(
  currentFeatures: SidebarNavItemId[] | null,
  enabledAddonKeys: string[]
): SidebarNavItemId[] | null {
  if (currentFeatures === null) return null
  const premiumSet = new Set<string>(PREMIUM_NAV_FEATURE_IDS)
  const core = currentFeatures.filter((id) => !premiumSet.has(id))
  for (const id of navIdsForEnabledAddonKeys(enabledAddonKeys)) {
    if (!core.includes(id)) core.push(id)
  }
  return resolveEnabledNavFeaturesForClient(core) ?? core
}
