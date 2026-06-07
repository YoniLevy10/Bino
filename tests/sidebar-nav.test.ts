import { describe, expect, it } from 'vitest'
import {
  ADDON_ONLY_SIDEBAR_NAV_IDS,
  DEFAULT_SIDEBAR_NAV_ORDER,
  parseSidebarNavOrderFromDb,
  resolveSidebarNavItems,
  splitMobileBottomNav,
} from '@/lib/sidebar-nav'

describe('resolveSidebarNavItems', () => {
  it('uses default order when custom order is null', () => {
    const items = resolveSidebarNavItems(null)
    expect(items.map((i) => i.id)).toEqual(DEFAULT_SIDEBAR_NAV_ORDER)
    expect(items.map((i) => i.label)).not.toContain('כשלי הודעות')
    for (const addonId of ADDON_ONLY_SIDEBAR_NAV_IDS) {
      expect(items.map((i) => i.id)).not.toContain(addonId)
    }
  })

  it('never shows add-on-only routes unless paid', () => {
    const unpaid = resolveSidebarNavItems(
      ['calendar', 'attendance', ...DEFAULT_SIDEBAR_NAV_ORDER],
      null
    )
    expect(unpaid.map((i) => i.id)).not.toContain('calendar')
    expect(unpaid.map((i) => i.id)).not.toContain('attendance')

    const paid = resolveSidebarNavItems(
      ['calendar', 'attendance', ...DEFAULT_SIDEBAR_NAV_ORDER],
      null,
      new Set(['calendar', 'attendance'] as const)
    )
    expect(paid.map((i) => i.id)).toContain('calendar')
    expect(paid.map((i) => i.id)).toContain('attendance')
  })

  it('applies custom order and appends missing ids', () => {
    const items = resolveSidebarNavItems(['summary', 'tickets', 'dashboard'])
    expect(items[0].id).toBe('summary')
    expect(items[1].id).toBe('tickets')
    expect(items[2].id).toBe('dashboard')
    expect(items.map((i) => i.id)).toHaveLength(DEFAULT_SIDEBAR_NAV_ORDER.length)
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
