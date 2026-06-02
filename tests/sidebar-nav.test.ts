import { describe, expect, it } from 'vitest'
import {
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
  })

  it('applies custom order and appends missing ids', () => {
    const items = resolveSidebarNavItems(['billing', 'tickets', 'dashboard'])
    expect(items[0].id).toBe('billing')
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
    const items = resolveSidebarNavItems(['billing', ...DEFAULT_SIDEBAR_NAV_ORDER])
    const { primary, more } = splitMobileBottomNav(items)
    expect(primary.map((i) => i.id)).toEqual(['dashboard', 'tickets', 'projects', 'workers'])
    expect(more.some((i) => i.id === 'billing')).toBe(true)
    expect(more.some((i) => i.id === 'dashboard')).toBe(false)
  })
})
