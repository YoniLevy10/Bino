import { describe, expect, it } from 'vitest'
import {
  ADDON_ONLY_SIDEBAR_NAV_IDS,
  DEFAULT_SIDEBAR_NAV_ORDER,
  PRIMARY_SIDEBAR_NAV_IDS,
  SIDEBAR_NAV_REGISTRY,
  TENANT_SIDEBAR_NAV_IDS,
  nextSidebarOrderAfterPinToggle,
  parseSidebarNavOrderFromDb,
  resolveSidebarNavItems,
  shouldShowMobileBottomNav,
  splitMobileBottomNav,
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

  it('hides an auto addon when the saved order omits it', () => {
    const withoutAttendance = DEFAULT_SIDEBAR_NAV_ORDER.filter((id) => id !== 'attendance')
    const items = resolveSidebarNavItems(
      withoutAttendance,
      null,
      new Set(['attendance'] as const)
    )
    expect(items.map((i) => i.id)).not.toContain('attendance')
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
})

describe('splitSidebarNavSections', () => {
  it('keeps the curated tenant list flat (no תפעול group)', () => {
    const items = appendAddonsNavAlways(resolveSidebarNavItems(null))
    const { primary, secondary, extras, addons } = splitSidebarNavSections(items)
    expect(primary.map((i) => i.id)).toEqual(FREE_SIDEBAR_IDS)
    expect(secondary).toEqual([])
    expect(extras).toEqual([])
    expect(addons?.id).toBe('addons')
    expect(PRIMARY_SIDEBAR_NAV_IDS).toEqual(TENANT_SIDEBAR_NAV_IDS)
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
  })

  it('labels attendance as החתמת עובדים', () => {
    expect(SIDEBAR_NAV_REGISTRY.attendance.label).toBe('החתמת עובדים')
  })
})

describe('shouldShowMobileBottomNav', () => {
  it('hides bottom nav on immersive WhatsApp inbox', () => {
    expect(shouldShowMobileBottomNav('/whatsapp-inbox')).toBe(false)
  })

  it('shows bottom nav on primary tenant routes', () => {
    expect(shouldShowMobileBottomNav('/tickets')).toBe(true)
    expect(shouldShowMobileBottomNav('/dashboard')).toBe(true)
    expect(shouldShowMobileBottomNav('/')).toBe(false)
  })
})
