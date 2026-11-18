import { z } from 'zod'

/** Not shown in tenant sidebar — platform ops only (email / superadmin). */
export const INTERNAL_SIDEBAR_NAV_ITEM_IDS = ['failed_notifications', 'error_logs'] as const

/** Stable ids — used in DB `clients.sidebar_nav_order` and settings UI. */
export const SIDEBAR_NAV_ITEM_IDS = [
  'dashboard',
  'tasks',
  'tickets',
  'projects',
  'residents',
  'workers',
  'site_tours',
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
  'finance',
  'bank',
  'reports',
  'parking',
] as const

export type SidebarNavItemId = (typeof SIDEBAR_NAV_ITEM_IDS)[number]

/**
 * Premium / add-on routes — access via /addons unless pinned into TENANT_SIDEBAR_NAV_IDS.
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

/** Shown in the tenant sidebar automatically when the paid addon is enabled. */
export const AUTO_SIDEBAR_ADDON_NAV_IDS: readonly SidebarNavItemId[] = [
  'whatsapp_inbox',
  'attendance',
  'collections',
] as const

export function isAutoSidebarAddonNavId(id: SidebarNavItemId): boolean {
  return (AUTO_SIDEBAR_ADDON_NAV_IDS as readonly string[]).includes(id)
}

export type SidebarNavItem = {
  id: SidebarNavItemId | 'addons'
  href: string
  label: string
  icon: string
  /** Paid addon entry — show lock styling in tenant UI */
  locked?: boolean
}

/**
 * Daily-use items pinned to the mobile bottom bar.
 * WhatsApp chats are the busiest screen, then projects (buildings).
 * When the inbox addon is off, `splitMobileBottomNav` falls back to workers.
 */
export const MOBILE_BOTTOM_PRIMARY_IDS: readonly SidebarNavItemId[] = [
  'dashboard',
  'tickets',
  'whatsapp_inbox',
  'projects',
]

/** Bottom bar when WhatsApp inbox is not in the visible nav. */
export const MOBILE_BOTTOM_PRIMARY_FALLBACK_IDS: readonly SidebarNavItemId[] = [
  'dashboard',
  'tickets',
  'projects',
  'workers',
]

/**
 * Tenant sidebar allowlist (order = default).
 * Auto addons (WhatsApp / attendance / collections) appear when enabled.
 * Other addons appear only after the tenant pins them from /addons.
 */
export const TENANT_SIDEBAR_NAV_IDS: readonly SidebarNavItemId[] = [
  'dashboard',
  'tasks',
  'tickets',
  'projects',
  'residents',
  'workers',
  'site_tours',
  'whatsapp_inbox',
  'attendance',
  'collections',
  'finance',
  'bank',
  'project_documents',
  'summary',
  'calendar',
  'professionals',
  'pilot_sms',
  'campaigns',
  'parking',
]

/** @deprecated use TENANT_SIDEBAR_NAV_IDS — kept as alias for primary flat sidebar. */
export const PRIMARY_SIDEBAR_NAV_IDS: readonly SidebarNavItemId[] = TENANT_SIDEBAR_NAV_IDS

/** No secondary "תפעול" group — remaining tools are under תוספים. */
export const SECONDARY_SIDEBAR_NAV_IDS: readonly SidebarNavItemId[] = []

/**
 * Collapsible sidebar group "ניהול כספים".
 * Children reuse existing screens; visibility still follows addon/pin rules.
 */
/**
 * ניהול כספים: גבייה · כספים (הוצאות/דוחות) · חשבון בנק עסקי (לקוח, לא בניין) · מסמכים.
 */
export const FINANCE_SIDEBAR_NAV_IDS: readonly SidebarNavItemId[] = [
  'collections',
  'finance',
  'bank',
  'project_documents',
] as const

export const FINANCE_NAV_GROUP_LABEL = 'ניהול כספים'

export function isTenantSidebarNavId(id: string): boolean {
  return (TENANT_SIDEBAR_NAV_IDS as readonly string[]).includes(id)
}

export function isPrimarySidebarNavId(id: string): boolean {
  return isTenantSidebarNavId(id)
}

export function isSecondarySidebarNavId(id: string): boolean {
  return (SECONDARY_SIDEBAR_NAV_IDS as readonly string[]).includes(id)
}

export function isFinanceSidebarNavId(id: string): boolean {
  return (FINANCE_SIDEBAR_NAV_IDS as readonly string[]).includes(id)
}

export function splitSidebarNavSections(items: SidebarNavItem[]): {
  primary: SidebarNavItem[]
  finance: SidebarNavItem[]
  secondary: SidebarNavItem[]
  extras: SidebarNavItem[]
  addons: SidebarNavItem | null
} {
  const primary: SidebarNavItem[] = []
  const finance: SidebarNavItem[] = []
  const secondary: SidebarNavItem[] = []
  const extras: SidebarNavItem[] = []
  let addons: SidebarNavItem | null = null
  for (const item of items) {
    if (item.id === 'addons') {
      addons = item
      continue
    }
    if (isFinanceSidebarNavId(item.id)) {
      finance.push(item)
      continue
    }
    if (isPrimarySidebarNavId(item.id)) primary.push(item)
    else if (isSecondarySidebarNavId(item.id)) secondary.push(item)
    else extras.push(item)
  }
  finance.sort((a, b) => {
    const ai = FINANCE_SIDEBAR_NAV_IDS.indexOf(a.id as SidebarNavItemId)
    const bi = FINANCE_SIDEBAR_NAV_IDS.indexOf(b.id as SidebarNavItemId)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
  return { primary, finance, secondary, extras, addons }
}

/** Split flat primary items around the finance group anchor for desktop/mobile chrome. */
export function splitPrimaryAroundFinanceGroup(primary: SidebarNavItem[]): {
  before: SidebarNavItem[]
  after: SidebarNavItem[]
} {
  const firstFinanceOrder = Math.min(
    ...FINANCE_SIDEBAR_NAV_IDS.map((id) => {
      const idx = TENANT_SIDEBAR_NAV_IDS.indexOf(id)
      return idx === -1 ? Number.POSITIVE_INFINITY : idx
    })
  )
  const before: SidebarNavItem[] = []
  const after: SidebarNavItem[] = []
  for (const item of primary) {
    const idx = TENANT_SIDEBAR_NAV_IDS.indexOf(item.id as SidebarNavItemId)
    if (idx !== -1 && idx < firstFinanceOrder) before.push(item)
    else after.push(item)
  }
  return { before, after }
}

export const SIDEBAR_NAV_REGISTRY: Record<SidebarNavItemId, SidebarNavItem> = {
  dashboard: { id: 'dashboard', href: '/dashboard', label: 'לוח בקרה', icon: 'home' },
  tasks: { id: 'tasks', href: '/tasks', label: 'ניהול משימות', icon: 'grid' },
  tickets: { id: 'tickets', href: '/tickets', label: 'תקלות', icon: 'ticket' },
  projects: { id: 'projects', href: '/projects', label: 'פרויקטים', icon: 'folder' },
  residents: { id: 'residents', href: '/residents', label: 'דיירים', icon: 'building' },
  workers: { id: 'workers', href: '/workers', label: 'העובדים שלי', icon: 'users' },
  site_tours: { id: 'site_tours', href: '/site-tours', label: 'סיורים', icon: 'folder' },
  summary: { id: 'summary', href: '/summary', label: 'דוחות', icon: 'chart' },
  calendar: { id: 'calendar', href: '/calendar', label: 'יומן משרד', icon: 'grid' },
  attendance: { id: 'attendance', href: '/attendance', label: 'החתמת עובדים', icon: 'clock' },
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
    label: 'מסמכים חשבונאיים',
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
    icon: 'coin',
  },
  finance: {
    id: 'finance',
    href: '/finance',
    label: 'כספים',
    icon: 'chart',
  },
  bank: {
    id: 'bank',
    href: '/finance/bank',
    label: 'חשבון בנק',
    icon: 'coin',
  },
  /** Deep-link — reports live under כספים workspace tabs; not a separate sidebar row. */
  reports: {
    id: 'reports',
    href: '/finance/reports',
    label: 'דוחות כספיים',
    icon: 'chart',
  },
  /** Savion PalGate pilot only — injected via nav-config, not default order. */
  parking: {
    id: 'parking',
    href: '/parking',
    label: 'חניונים',
    icon: 'car',
  },
}

/**
 * Default sidebar order (no extra pinned addons).
 * Auto addon ids here render only when the paid addon is enabled.
 */
export const DEFAULT_SIDEBAR_NAV_ORDER: SidebarNavItemId[] = [
  'dashboard',
  'tasks',
  'tickets',
  'projects',
  'residents',
  'workers',
  'site_tours',
  'whatsapp_inbox',
  'attendance',
  'collections',
  'finance',
  'bank',
  'project_documents',
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

export type ResolveSidebarNavOptions = {
  /** Savion PalGate pilot — allow `parking` when present in customOrder. */
  includeParkingPilot?: boolean
}

export function resolveSidebarNavItems(
  customOrder: SidebarNavItemId[] | null | undefined,
  enabledFeatures?: SidebarNavItemId[] | null,
  paidNavIds?: ReadonlySet<SidebarNavItemId>,
  customLabels?: SidebarNavLabels | null,
  opts?: ResolveSidebarNavOptions
): SidebarNavItem[] {
  const seen = new Set<SidebarNavItemId>()
  const result: SidebarNavItem[] = []
  const allowedSet =
    enabledFeatures && enabledFeatures.length > 0 ? new Set(enabledFeatures) : null

  const orderedIds = (customOrder?.length ? customOrder : DEFAULT_SIDEBAR_NAV_ORDER).filter(
    (id) => !isInternalSidebarNavItemId(id)
  )

  const includeId = (id: SidebarNavItemId): boolean => {
    if (!isTenantSidebarNavId(id)) return false
    // PalGate / חניונים — only when caller opts in (Savion pilot). Never default-on.
    if (id === 'parking') {
      if (!opts?.includeParkingPilot) return false
      return Boolean(customOrder?.includes('parking'))
    }
    if (isAddonOnlySidebarNavId(id) && !paidNavIds?.has(id)) return false
    // Pin-only addons require an explicit sidebar_nav_order entry.
    if (isAddonOnlySidebarNavId(id) && !isAutoSidebarAddonNavId(id)) {
      if (!customOrder?.includes(id)) return false
    }
    // Core finance/reports always show (like dashboard/tickets) even when a
    // saved enabled_nav_features allowlist predates them.
    if (id === 'finance' || id === 'bank') {
      return true
    }
    // Auto addons (WhatsApp / attendance / collections): show whenever
    // entitled — even if a saved order / enabled_nav_features allowlist predates
    // the feature (omission ≠ intentional unpin for newly shipped auto ids).
    if (allowedSet && !allowedSet.has(id)) {
      if (!(isAutoSidebarAddonNavId(id) && paidNavIds?.has(id))) return false
    }
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

  // Keep curated order even when DB custom order still has summary early
  // and newly enabled addons are appended later.
  result.sort((a, b) => {
    const ai = TENANT_SIDEBAR_NAV_IDS.indexOf(a.id as SidebarNavItemId)
    const bi = TENANT_SIDEBAR_NAV_IDS.indexOf(b.id as SidebarNavItemId)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  return applySidebarNavLabels(result, customLabels)
}

export function nextSidebarOrderAfterPinToggle(
  currentOrder: SidebarNavItemId[] | null | undefined,
  enabledFeatures: SidebarNavItemId[] | null | undefined,
  paidNavIds: ReadonlySet<SidebarNavItemId>,
  navId: SidebarNavItemId,
  pinned: boolean
): SidebarNavItemId[] {
  const visible = resolveSidebarNavItems(currentOrder, enabledFeatures, paidNavIds)
    .map((item) => item.id)
    .filter((id): id is SidebarNavItemId => id !== 'addons')

  const next = pinned
    ? visible.includes(navId)
      ? visible
      : [...visible, navId]
    : visible.filter((id) => id !== navId)

  for (const required of ['dashboard', 'tickets'] as const) {
    if (!next.includes(required)) next.unshift(required)
  }
  return next
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
  // כספים (הוצאות/דוחות) vs חשבון בנק — separate highlight targets.
  if (item.href === '/finance') {
    if (pathname.startsWith('/finance/bank')) return false
    return pathname === '/finance' || pathname.startsWith('/finance/')
  }
  if (item.href === '/finance/bank') {
    return pathname === '/finance/bank' || pathname.startsWith('/finance/bank/')
  }
  if (item.href === '/finance/reports') {
    return pathname === '/finance/reports' || pathname.startsWith('/finance/reports/')
  }
  return pathname === item.href
}

export function splitMobileBottomNav(items: SidebarNavItem[]): {
  primary: SidebarNavItem[]
  more: SidebarNavItem[]
} {
  const byId = new Map(items.map((item) => [item.id, item]))
  const slotIds = byId.has('whatsapp_inbox')
    ? MOBILE_BOTTOM_PRIMARY_IDS
    : MOBILE_BOTTOM_PRIMARY_FALLBACK_IDS
  const primaryIdSet = new Set<string>(slotIds)
  const primary = slotIds
    .map((id) => byId.get(id))
    .filter((item): item is SidebarNavItem => item != null)
  const more = items.filter((item) => !primaryIdSet.has(item.id))
  return { primary, more }
}

/** Tenant-facing routes only (no platform diagnostics). */
export const TENANT_NAV_HREFS = new Set(
  Object.values(SIDEBAR_NAV_REGISTRY).map((item) => item.href)
)

/** Routes that cover the floating tab bar. WhatsApp inbox keeps the bar and insets the thread. */
export const MOBILE_BOTTOM_NAV_HIDDEN_HREFS = new Set<string>()

export function shouldShowMobileBottomNav(pathname: string): boolean {
  if (MOBILE_BOTTOM_NAV_HIDDEN_HREFS.has(pathname)) return false
  if (TENANT_NAV_HREFS.has(pathname)) return true
  if (pathname === '/settings' || pathname === '/addons' || pathname === '/worker') return true
  return false
}
