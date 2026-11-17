import { describe, expect, it } from 'vitest'
import {
  ADDON_ONLY_SIDEBAR_NAV_IDS,
  DEFAULT_SIDEBAR_NAV_ORDER,
  FINANCE_NAV_GROUP_LABEL,
  FINANCE_SIDEBAR_NAV_IDS,
  PRIMARY_SIDEBAR_NAV_IDS,
  SIDEBAR_NAV_REGISTRY,
  TENANT_SIDEBAR_NAV_IDS,
  nextSidebarOrderAfterPinToggle,
  parseSidebarNavOrderFromDb,
  resolveSidebarNavItems,
  shouldShowMobileBottomNav,
  MOBILE_BOTTOM_PRIMARY_IDS,
  splitMobileBottomNav,
  splitPrimaryAroundFinanceGroup,
  splitSidebarNavSections,
} from '@/lib/sidebar-nav'
import { appendAddonsNavAlways, injectPaidAddonNavItems } from '@/lib/addons-nav'

const FREE_SIDEBAR_IDS = DEFAULT_SIDEBAR_NAV_ORDER.filter((id) => !ADDON_ONLY_SIDEBAR_NAV_IDS.includes(id))

describe('resolveSidebarNavItems', () => {
  it('uses free default order when custom order is null and unpaid', () => {
    const items = resolveSidebarNavItems(null)
    expect(items.map((i) => i.id)).toEqual(FREE_SIDEBAR_IDS)
    expect(items.map((i) => i.label)).not.toContain('כשלי הודעות')
    for (const addonId of ADDON_ONLY_SIDEBAR_NAV_IDS) {
      expect(items.map((i) => i.id)).not.toContain(addonId)
    }
  })

  it('shows pinned paid addons only when enabled; never unpinned addons', () => {
    const unpaid = resolveSidebarNavItems(
      ['calendar', 'attendance', ...DEFAULT_SIDEBAR_NAV_ORDER],
      null
    )
    expect(unpaid.map((i) => i.id)).not.toContain('calendar')
    expect(unpaid.map((i) => i.id)).not.toContain('attendance')

    const paid = resolveSidebarNavItems(
      ['calendar', 'attendance', 'collections', ...DEFAULT_SIDEBAR_NAV_ORDER],
      null,
      new Set(['calendar', 'attendance', 'collections'] as const)
    )
    expect(paid.map((i) => i.id)).toContain('attendance')
    expect(paid.map((i) => i.id)).toContain('collections')
    expect(paid.map((i) => i.id)).toContain('calendar')
  })

  it('does not show pin-only addons until they are in sidebar_nav_order', () => {
    const paidUnpinned = resolveSidebarNavItems(
      null,
      null,
      new Set(['calendar', 'professionals', 'attendance'] as const)
    )
    expect(paidUnpinned.map((i) => i.id)).toContain('attendance')
    expect(paidUnpinned.map((i) => i.id)).not.toContain('calendar')
    expect(paidUnpinned.map((i) => i.id)).not.toContain('professionals')
  })

  it('still shows entitled auto addons when a saved order omits them', () => {
    // Stale sidebar_nav_order (saved before the auto addon shipped) must not hide it.
    const withoutAttendance = DEFAULT_SIDEBAR_NAV_ORDER.filter((id) => id !== 'attendance')
    const items = resolveSidebarNavItems(
      withoutAttendance,
      null,
      new Set(['attendance'] as const)
    )
    expect(items.map((i) => i.id)).toContain('attendance')
  })

  it('shows finance/reports as core even if order + features allowlist omit them', () => {
    const bamakorLikeOrder = [
      'dashboard',
      'tasks',
      'tickets',
      'projects',
      'residents',
      'workers',
      'site_tours',
      'whatsapp_inbox',
      'collections',
      'professionals',
      'summary',
      'project_documents',
    ] as const
    const bamakorLikeFeatures = [
      'attendance',
      'calendar',
      'campaigns',
      'collections',
      'dashboard',
      'pending_residents',
      'pilot_sms',
      'professionals',
      'project_documents',
      'projects',
      'qr',
      'residents',
      'site_tours',
      'summary',
      'tasks',
      'tickets',
      'whatsapp_inbox',
      'whatsapp_templates',
      'workers',
    ] as const
    const items = resolveSidebarNavItems(
      [...bamakorLikeOrder],
      [...bamakorLikeFeatures],
      new Set(['whatsapp_inbox', 'collections', 'professionals', 'project_documents'] as const)
    )
    expect(items.map((i) => i.id)).toContain('finance')
    expect(items.find((i) => i.id === 'finance')?.label).toBe('הכנסות והוצאות')
    expect(items.map((i) => i.id)).toContain('reports')
    expect(items.find((i) => i.id === 'reports')?.label).toBe('דוחות כספיים')
    expect(items.find((i) => i.id === 'summary')?.label).toBe('דוחות')
    const financeIdx = items.findIndex((i) => i.id === 'finance')
    const reportsIdx = items.findIndex((i) => i.id === 'reports')
    expect(reportsIdx).toBe(financeIdx + 1)
  })

  it('applies curated tenant order (custom order cannot float summary above addons)', () => {
    const items = resolveSidebarNavItems(['summary', 'tickets', 'dashboard'])
    expect(items.map((i) => i.id)).toEqual([
      'dashboard',
      'tasks',
      'tickets',
      'projects',
      'residents',
      'workers',
      'site_tours',
      'finance',
      'reports',
      'summary',
    ])
  })

  it('keeps summary last when auto addons are in the saved order', () => {
    const items = resolveSidebarNavItems(
      ['summary', 'dashboard', 'tickets', 'whatsapp_inbox', 'attendance'],
      null,
      new Set(['whatsapp_inbox', 'attendance'] as const)
    )
    expect(items.map((i) => i.id)).toEqual([
      'dashboard',
      'tasks',
      'tickets',
      'projects',
      'residents',
      'workers',
      'site_tours',
      'whatsapp_inbox',
      'attendance',
      'finance',
      'reports',
      'summary',
    ])
  })

  it('strips qr/templates/pending from sidebar even if in custom order', () => {
    const items = resolveSidebarNavItems(
      ['qr', 'whatsapp_templates', 'pending_residents', ...DEFAULT_SIDEBAR_NAV_ORDER],
      null
    )
    expect(items.map((i) => i.id)).not.toContain('qr')
    expect(items.map((i) => i.id)).not.toContain('whatsapp_templates')
    expect(items.map((i) => i.id)).not.toContain('pending_residents')
  })

  it('strips internal diagnostics ids from db payload', () => {
    const parsed = parseSidebarNavOrderFromDb([
      'tickets',
      'failed_notifications',
      'error_logs',
      'projects',
    ])
    expect(parsed).toEqual(['tickets', 'projects'])
  })
})

describe('splitMobileBottomNav', () => {
  it('keeps four primary slots and puts the rest in more', () => {
    const items = resolveSidebarNavItems(['summary', ...DEFAULT_SIDEBAR_NAV_ORDER])
    const { primary, more } = splitMobileBottomNav(items)
    expect(primary.map((i) => i.id)).toEqual(['dashboard', 'tickets', 'projects', 'workers'])
    expect(more.some((i) => i.id === 'summary')).toBe(true)
    expect(more.some((i) => i.id === 'dashboard')).toBe(false)
  })

  it('pins WhatsApp chats and projects when the inbox is visible', () => {
    const items = resolveSidebarNavItems(DEFAULT_SIDEBAR_NAV_ORDER, null, new Set(['whatsapp_inbox']))
    const { primary, more } = splitMobileBottomNav(items)
    expect(MOBILE_BOTTOM_PRIMARY_IDS).toEqual(['dashboard', 'tickets', 'whatsapp_inbox', 'projects'])
    expect(primary.map((i) => i.id)).toEqual(['dashboard', 'tickets', 'whatsapp_inbox', 'projects'])
    expect(more.some((i) => i.id === 'workers')).toBe(true)
    expect(more.some((i) => i.id === 'whatsapp_inbox')).toBe(false)
  })
})

describe('splitSidebarNavSections', () => {
  it('groups finance children under ניהול כספים and keeps operational דוחות separate', () => {
    const items = appendAddonsNavAlways(resolveSidebarNavItems(null))
    const { primary, finance, secondary, extras, addons } = splitSidebarNavSections(items)
    expect(finance.map((i) => i.id)).toEqual(['finance', 'reports'])
    expect(finance.map((i) => i.label)).toEqual(['הכנסות והוצאות', 'דוחות כספיים'])
    expect(FINANCE_NAV_GROUP_LABEL).toBe('ניהול כספים')
    expect(FINANCE_SIDEBAR_NAV_IDS).toEqual([
      'collections',
      'finance',
      'reports',
      'project_documents',
    ])
    expect(primary.map((i) => i.id)).toEqual(
      FREE_SIDEBAR_IDS.filter((id) => !FINANCE_SIDEBAR_NAV_IDS.includes(id))
    )
    expect(primary.find((i) => i.id === 'summary')?.label).toBe('דוחות')
    expect(secondary).toEqual([])
    expect(extras).toEqual([])
    expect(addons?.id).toBe('addons')
    expect(PRIMARY_SIDEBAR_NAV_IDS).toEqual(TENANT_SIDEBAR_NAV_IDS)

    const paid = appendAddonsNavAlways(
      resolveSidebarNavItems(null, null, new Set(['collections', 'project_documents'] as const))
    )
    const paidSplit = splitSidebarNavSections(paid)
    expect(paidSplit.finance.map((i) => i.id)).toEqual(['collections', 'finance', 'reports'])
    // project_documents stays pin-only — not auto-injected into the finance group
    expect(paidSplit.finance.map((i) => i.id)).not.toContain('project_documents')

    const pinnedDocs = appendAddonsNavAlways(
      resolveSidebarNavItems(
        [...DEFAULT_SIDEBAR_NAV_ORDER, 'project_documents'],
        null,
        new Set(['collections', 'project_documents'] as const)
      )
    )
    expect(splitSidebarNavSections(pinnedDocs).finance.map((i) => i.id)).toEqual([
      'collections',
      'finance',
      'reports',
      'project_documents',
    ])

    const { before, after } = splitPrimaryAroundFinanceGroup(paidSplit.primary)
    expect(before.map((i) => i.id)).toContain('dashboard')
    expect(after.map((i) => i.id)).toContain('summary')
  })
})

describe('nextSidebarOrderAfterPinToggle', () => {
  it('pins calendar onto the visible sidebar order', () => {
    const paid = new Set(['calendar', 'attendance'] as const)
    const next = nextSidebarOrderAfterPinToggle(null, null, paid, 'calendar', true)
    expect(next).toContain('calendar')
    expect(next).toContain('dashboard')
    expect(next).toContain('attendance')
  })

  it('unpins an auto addon from the saved order', () => {
    const paid = new Set(['attendance'] as const)
    const next = nextSidebarOrderAfterPinToggle(null, null, paid, 'attendance', false)
    expect(next).not.toContain('attendance')
    expect(next).toContain('dashboard')
  })
})

describe('injectPaidAddonNavItems', () => {
  it('does not auto-inject non-pinned enabled addons into the sidebar', () => {
    const base = resolveSidebarNavItems(null)
    const withInject = injectPaidAddonNavItems(base, ['calendar', 'campaigns'])
    expect(withInject.map((i) => i.id)).toEqual(base.map((i) => i.id))
    expect(withInject.map((i) => i.id)).not.toContain('calendar')
  })
})

describe('addon nav hrefs', () => {
  it('routes project-scoped add-ons to dedicated pages', () => {
    expect(SIDEBAR_NAV_REGISTRY.pilot_sms.href).toBe('/pilot-sms')
    expect(SIDEBAR_NAV_REGISTRY.project_documents.href).toBe('/project-documents')
    expect(SIDEBAR_NAV_REGISTRY.finance.href).toBe('/finance')
  })

  it('labels attendance as החתמת עובדים', () => {
    expect(SIDEBAR_NAV_REGISTRY.attendance.label).toBe('החתמת עובדים')
  })

  it('labels finance as הכנסות והוצאות and shows as core without paid entitlement', () => {
    expect(SIDEBAR_NAV_REGISTRY.finance.label).toBe('הכנסות והוצאות')
    const items = resolveSidebarNavItems(null, null, new Set())
    expect(items.map((i) => i.id)).toContain('finance')
  })

  it('labels financial reports as דוחות כספיים and shows as core without paid entitlement', () => {
    expect(SIDEBAR_NAV_REGISTRY.reports.href).toBe('/finance/reports')
    expect(SIDEBAR_NAV_REGISTRY.reports.label).toBe('דוחות כספיים')
    const items = resolveSidebarNavItems(null, null, new Set())
    expect(items.map((i) => i.id)).toContain('reports')
  })

  it('labels operational summary as דוחות at /summary', () => {
    expect(SIDEBAR_NAV_REGISTRY.summary.href).toBe('/summary')
    expect(SIDEBAR_NAV_REGISTRY.summary.label).toBe('דוחות')
  })

  it('labels project documents as מסמכים חשבונאיים under finance IA', () => {
    expect(SIDEBAR_NAV_REGISTRY.project_documents.href).toBe('/project-documents')
    expect(SIDEBAR_NAV_REGISTRY.project_documents.label).toBe('מסמכים חשבונאיים')
  })
})

describe('shouldShowMobileBottomNav', () => {
  it('shows bottom nav on the WhatsApp inbox', () => {
    expect(shouldShowMobileBottomNav('/whatsapp-inbox')).toBe(true)
  })

  it('shows bottom nav on primary tenant routes', () => {
    expect(shouldShowMobileBottomNav('/tickets')).toBe(true)
    expect(shouldShowMobileBottomNav('/dashboard')).toBe(true)
    expect(shouldShowMobileBottomNav('/')).toBe(false)
  })
})
