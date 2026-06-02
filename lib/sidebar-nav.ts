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
  'qr',
  'whatsapp_templates',
  'billing',
  'pending_residents',
  'pilot_sms',
  'project_documents',
] as const

export type SidebarNavItemId = (typeof SIDEBAR_NAV_ITEM_IDS)[number]

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

export const SIDEBAR_NAV_REGISTRY: Record<SidebarNavItemId, SidebarNavItem> = {
  dashboard: { id: 'dashboard', href: '/', label: 'לוח בקרה', icon: 'home' },
  tickets: { id: 'tickets', href: '/tickets', label: 'תקלות', icon: 'ticket' },
  projects: { id: 'projects', href: '/projects', label: 'פרויקטים', icon: 'folder' },
  residents: { id: 'residents', href: '/residents', label: 'דיירים', icon: 'building' },
  workers: { id: 'workers', href: '/workers', label: 'עובדים', icon: 'users' },
  summary: { id: 'summary', href: '/summary', label: 'סיכום', icon: 'chart' },
  calendar: { id: 'calendar', href: '/calendar', label: 'יומן', icon: 'grid' },
  attendance: { id: 'attendance', href: '/attendance', label: 'שעון עובדים', icon: 'clock' },
  qr: { id: 'qr', href: '/qr', label: 'קודי QR', icon: 'qr' },
  whatsapp_templates: {
    id: 'whatsapp_templates',
    href: '/settings/whatsapp-templates',
    label: 'תבניות וואטסאפ',
    icon: 'message',
  },
  billing: { id: 'billing', href: '/billing', label: 'חיוב ושימוש', icon: 'chart' },
  pending_residents: {
    id: 'pending_residents',
    href: '/pending-residents',
    label: 'דיירים ממתינים',
    icon: 'building',
  },
  pilot_sms: {
    id: 'pilot_sms',
    href: '/projects',
    label: 'SMS פיילוט לדיירים',
    icon: 'message',
  },
  project_documents: {
    id: 'project_documents',
    href: '/projects',
    label: 'תיקיית מסמכים לפרויקט',
    icon: 'folder',
  },
}

/** Default order: core ops → people → reporting → scheduling → tools. */
export const DEFAULT_SIDEBAR_NAV_ORDER: SidebarNavItemId[] = [
  'dashboard',
  'tickets',
  'projects',
  'residents',
  'workers',
  'summary',
  'calendar',
  'attendance',
  'qr',
  'whatsapp_templates',
  'billing',
  'pending_residents',
]

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
  enabledFeatures?: SidebarNavItemId[] | null
): SidebarNavItem[] {
  const seen = new Set<SidebarNavItemId>()
  const result: SidebarNavItem[] = []
  const allowedSet =
    enabledFeatures && enabledFeatures.length > 0 ? new Set(enabledFeatures) : null

  const orderedIds = (customOrder?.length ? customOrder : DEFAULT_SIDEBAR_NAV_ORDER).filter(
    (id) => !isInternalSidebarNavItemId(id)
  )

  for (const id of orderedIds) {
    if (!isSidebarNavItemId(id) || seen.has(id)) continue
    if (allowedSet && !allowedSet.has(id)) continue
    seen.add(id)
    result.push(SIDEBAR_NAV_REGISTRY[id])
  }

  for (const id of DEFAULT_SIDEBAR_NAV_ORDER) {
    if (!seen.has(id)) {
      if (allowedSet && !allowedSet.has(id)) continue
      seen.add(id)
      result.push(SIDEBAR_NAV_REGISTRY[id])
    }
  }

  return result
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
