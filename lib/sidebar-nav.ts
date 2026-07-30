import { z } from 'zod'

/** Not shown in tenant sidebar — platform ops only (email / superadmin). */
export const INTERNAL_SIDEBAR_NAV_ITEM_IDS = ['failed_notifications', 'error_logs'] as const

/** Stable ids — used in DB `clients.sidebar_nav_order` and settings UI. */
export const SIDEBAR_NAV_ITEM_IDS = [
  'dashboard',
  'tickets',
  'projects',
  'residents',
  'workers',
  'summary',
  'calendar',
  'attendance',
  'professionals',
  'qr',
  'whatsapp_templates',
  'pending_residents',
  'pilot_sms',
  'project_documents',
  'whatsapp_inbox',
  'campaigns',
  'collections',
] as const

export type SidebarNavItemId = (typeof SIDEBAR_NAV_ITEM_IDS)[number]

/**
 * Premium / add-on routes — never in tenant sidebar (access via /addons and deep links).
 * Keep in sync with PREMIUM_NAV_FEATURE_IDS in client-nav-features.ts.
 */
export const ADDON_ONLY_SIDEBAR_NAV_IDS: readonly SidebarNavItemId[] = [
  'calendar',
  'attendance',
  'professionals',
  'pilot_sms',
  'project_documents',
  'whatsapp_inbox',
  'campaigns',
  'collections',
] as const

export function isAddonOnlySidebarNavId(id: SidebarNavItemId): boolean {
  return (ADDON_ONLY_SIDEBAR_NAV_IDS as readonly string[]).includes(id)
}

export type SidebarNavItem = {
  id: SidebarNavItemId | 'addons'
  href: string
  label: string
  icon: string
  /** Paid addon entry — show lock styling in tenant UI */
  locked?: boolean
}

/** Daily-use items pinned to the mobile bottom bar (order among them follows sidebar order). */
export const MOBILE_BOTTOM_PRIMARY_IDS: readonly SidebarNavItemId[] = [
  'dashboard',
  'tickets',
  'projects',
  'workers',
]

/**
 * Core daily sidebar items — always shown at the top of the desktop sidebar.
 * Secondary (תפעול) items render under a collapsible group.
 */
export const PRIMARY_SIDEBAR_NAV_IDS: readonly SidebarNavItemId[] = [
  'dashboard',
  'tickets',
  'projects',
  'residents',
  'workers',
]

/** Ops / less-frequent tools — shown under "תפעול" when present in resolved nav. */
export const SECONDARY_SIDEBAR_NAV_IDS: readonly SidebarNavItemId[] = [
  'qr',
  'whatsapp_templates',
  'pending_residents',
  'summary',
]

export function isPrimarySidebarNavId(id: string): boolean {
  return (PRIMARY_SIDEBAR_NAV_IDS as readonly string[]).includes(id)
}

export function isSecondarySidebarNavId(id: string): boolean {
  return (SECONDARY_SIDEBAR_NAV_IDS as readonly string[]).includes(id)
}

export function splitSidebarNavSections(items: SidebarNavItem[]): {
  primary: SidebarNavItem[]
  secondary: SidebarNavItem[]
  /** Paid addons / other extras that appear via custom order — keep under תפעול. */
  extras: SidebarNavItem[]
  addons: SidebarNavItem | null
} {
  const primary: SidebarNavItem[] = []
  const secondary: SidebarNavItem[] = []
  const extras: SidebarNavItem[] = []
  let addons: SidebarNavItem | null = null
  for (const item of items) {
    if (item.id === 'addons') {
      addons = item
      continue
    }
    if (isPrimarySidebarNavId(item.id)) primary.push(item)
    else if (isSecondarySidebarNavId(item.id)) secondary.push(item)
    else extras.push(item)
  }
  return { primary, secondary, extras, addons }
}

export const SIDEBAR_NAV_REGISTRY: Record<SidebarNavItemId, SidebarNavItem> = {
  dashboard: { id: 'dashboard', href: '/', label: 'לוח בקרה', icon: 'home' },
  tickets: { id: 'tickets', href: '/tickets', label: 'תקלות', icon: 'ticket' },
  projects: { id: 'projects', href: '/projects', label: 'פרויקטים', icon: 'folder' },
  residents: { id: 'residents', href: '/residents', label: 'דיירים', icon: 'building' },
  workers: { id: 'workers', href: '/workers', label: 'העובדים שלי', icon: 'users' },
  summary: { id: 'summary', href: '/summary', label: 'סיכום', icon: 'chart' },
  calendar: { id: 'calendar', href: '/calendar', label: 'יומן משרד', icon: 'grid' },
  attendance: { id: 'attendance', href: '/attendance', label: 'חתמת עובדים', icon: 'clock' },
  professionals: { id: 'professionals', href: '/professionals', label: 'אנשי מקצוע', icon: 'users' },
  qr: { id: 'qr', href: '/qr', label: 'קודי QR', icon: 'qr' },
  whatsapp_templates: {
    id: 'whatsapp_templates',
    href: '/settings/whatsapp-templates',
    label: 'תבניות וואטסאפ',
    icon: 'message',
  },
  pending_residents: {
    id: 'pending_residents',
    href: '/pending-residents',
    label: 'דיירים ממתינים',
    icon: 'building',
  },
  pilot_sms: {
    id: 'pilot_sms',
    href: '/pilot-sms',
    label: 'SMS פיילוט לדיירים',
    icon: 'message',
  },
  project_documents: {
    id: 'project_documents',
    href: '/project-documents',
    label: 'תיקיית מסמכים לפרויקט',
    icon: 'folder',
  },
  whatsapp_inbox: {
    id: 'whatsapp_inbox',
    href: '/whatsapp-inbox',
    label: 'תיבת WhatsApp',
    icon: 'message',
  },
  campaigns: {
    id: 'campaigns',
    href: '/campaigns',
    label: 'קמפיינים SMS',
    icon: 'message',
  },
  collections: {
    id: 'collections',
    href: '/collections',
    label: 'גביית ועד',
    icon: 'chart',
  },
}

/** Default sidebar order — daily core first, then ops tools (excludes add-on-only routes). */
export const DEFAULT_SIDEBAR_NAV_ORDER: SidebarNavItemId[] = [
  'dashboard',
  'tickets',
  'projects',
  'residents',
  'workers',
  'qr',
  'whatsapp_templates',
  'pending_residents',
  'summary',
]

export type SidebarNavLabels = Partial<Record<SidebarNavItemId, string>>

const sidebarNavLabelFields = Object.fromEntries(
  SIDEBAR_NAV_ITEM_IDS.map((id) => [id, z.string().min(1).max(80).optional()])
) as { [K in SidebarNavItemId]: z.ZodOptional<z.ZodString> }

/** Partial map — only customized labels are sent from settings UI. */
export const sidebarNavLabelsSchema = z.object(sidebarNavLabelFields).strict()

export function parseSidebarNavLabelsFromDb(value: unknown): SidebarNavLabels {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: SidebarNavLabels = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (!isSidebarNavItemId(key) || typeof val !== 'string') continue
    const trimmed = val.trim()
    if (trimmed) out[key] = trimmed
  }
  return out
}

export function applySidebarNavLabels(
  items: SidebarNavItem[],
  labels: SidebarNavLabels | null | undefined
): SidebarNavItem[] {
  if (!labels || Object.keys(labels).length === 0) return items
  return items.map((item) => {
    if (item.id === 'addons') return item
    const custom = labels[item.id as SidebarNavItemId]
    return custom ? { ...item, label: custom } : item
  })
}

const navIdSet = new Set<string>(SIDEBAR_NAV_ITEM_IDS)
const internalNavIdSet = new Set<string>(INTERNAL_SIDEBAR_NAV_ITEM_IDS)

export function isSidebarNavItemId(id: string): id is SidebarNavItemId {
  return navIdSet.has(id)
}

export function isInternalSidebarNavItemId(id: string): boolean {
  return internalNavIdSet.has(id)
}

export const sidebarNavOrderSchema = z
  .array(z.enum(SIDEBAR_NAV_ITEM_IDS))
  .min(1)
  .max(SIDEBAR_NAV_ITEM_IDS.length)

export function parseSidebarNavOrderFromDb(value: unknown): SidebarNavItemId[] | null {
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
  return ids.length > 0 ? ids : null
}

export function resolveSidebarNavItems(
  customOrder: SidebarNavItemId[] | null | undefined,
  enabledFeatures?: SidebarNavItemId[] | null,
  paidNavIds?: ReadonlySet<SidebarNavItemId>,
  customLabels?: SidebarNavLabels | null
): SidebarNavItem[] {
  const seen = new Set<SidebarNavItemId>()
  const result: SidebarNavItem[] = []
  const allowedSet =
    enabledFeatures && enabledFeatures.length > 0 ? new Set(enabledFeatures) : null

  const orderedIds = (customOrder?.length ? customOrder : DEFAULT_SIDEBAR_NAV_ORDER).filter(
    (id) => !isInternalSidebarNavItemId(id)
  )

  const includeId = (id: SidebarNavItemId): boolean => {
    if (isAddonOnlySidebarNavId(id) && !paidNavIds?.has(id)) return false
    if (allowedSet && !allowedSet.has(id)) return false
    return true
  }

  for (const id of orderedIds) {
    if (!isSidebarNavItemId(id) || seen.has(id)) continue
    if (!includeId(id)) continue
    seen.add(id)
    result.push(SIDEBAR_NAV_REGISTRY[id])
  }

  for (const id of DEFAULT_SIDEBAR_NAV_ORDER) {
    if (!seen.has(id) && includeId(id)) {
      seen.add(id)
      result.push(SIDEBAR_NAV_REGISTRY[id])
    }
  }

  return applySidebarNavLabels(result, customLabels)
}

export function resolveSidebarNavOrderIds(customOrder: SidebarNavItemId[] | null | undefined): SidebarNavItemId[] {
  return resolveSidebarNavItems(customOrder)
    .map((item) => item.id)
    .filter((id): id is SidebarNavItemId => id !== 'addons')
}

export function isNavItemActive(pathname: string, item: Pick<SidebarNavItem, 'href'>): boolean {
  if (item.href === '/settings/whatsapp-templates') {
    return pathname.startsWith('/settings/whatsapp-templates')
  }
  if (item.href === '/addons') {
    return pathname === '/addons' || pathname.startsWith('/addons/')
  }
  return pathname === item.href
}

export function splitMobileBottomNav(items: SidebarNavItem[]): {
  primary: SidebarNavItem[]
  more: SidebarNavItem[]
} {
  const primaryIdSet = new Set<string>(MOBILE_BOTTOM_PRIMARY_IDS)
  const byId = new Map(items.map((item) => [item.id, item]))
  const primary = MOBILE_BOTTOM_PRIMARY_IDS.map((id) => byId.get(id)).filter(
    (item): item is SidebarNavItem => item != null
  )
  const more = items.filter((item) => !primaryIdSet.has(item.id))
  return { primary, more }
}

/** Tenant-facing routes only (no platform diagnostics). */
export const TENANT_NAV_HREFS = new Set(
  Object.values(SIDEBAR_NAV_REGISTRY).map((item) => item.href)
)

/** Immersive pages (chat, etc.) — hide the mobile bottom tab bar so compose is not covered. */
export const MOBILE_BOTTOM_NAV_HIDDEN_HREFS = new Set(['/whatsapp-inbox'])

export function shouldShowMobileBottomNav(pathname: string): boolean {
  if (MOBILE_BOTTOM_NAV_HIDDEN_HREFS.has(pathname)) return false
  if (TENANT_NAV_HREFS.has(pathname)) return true
  if (pathname === '/settings' || pathname === '/addons' || pathname === '/worker') return true
  return false
}
