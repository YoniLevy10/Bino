import { describe, expect, it } from 'vitest'
import {
  ADDON_ONLY_SIDEBAR_NAV_IDS,
  DEFAULT_SIDEBAR_NAV_ORDER,
  PRIMARY_SIDEBAR_NAV_IDS,
  SIDEBAR_NAV_REGISTRY,
  TENANT_SIDEBAR_NAV_IDS,
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
    // calendar is paid but not in the curated sidebar — stays under /addons
    expect(paid.map((i) => i.id)).not.toContain('calendar')
  })

  it('applies custom order among allowed ids and appends missing defaults', () => {
    const items = resolveSidebarNavItems(['summary', 'tickets', 'dashboard'])
    expect(items[0].id).toBe('summary')
    expect(items[1].id).toBe('tickets')
    expect(items[2].id).toBe('dashboard')
    expect(items.map((i) => i.id)).toEqual(
      expect.arrayContaining(['projects', 'residents', 'workers'])
    )
    expect(items.map((i) => i.id)).toHaveLength(FREE_SIDEBAR_IDS.length)
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

  it('keeps qr / templates / pending out of the sidebar', () => {
    const items = resolveSidebarNavItems(
      ['qr', 'whatsapp_templates', 'pending_residents', ...DEFAULT_SIDEBAR_NAV_ORDER],
      null
    )
    expect(items.map((i) => i.id)).not.toContain('qr')
    expect(items.map((i) => i.id)).not.toContain('whatsapp_templates')
    expect(items.map((i) => i.id)).not.toContain('pending_residents')
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
    expect(shouldShowMobileBottomNav('/')).toBe(true)
  })
})
