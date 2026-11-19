import { describe, expect, it } from 'vitest'
import { resolveSidebarNavItems, DEFAULT_SIDEBAR_NAV_ORDER } from '@/lib/sidebar-nav'

describe('parking nav pilot injection', () => {
  it('does not show parking in default tenant nav', () => {
    const items = resolveSidebarNavItems(null)
    expect(items.map((i) => i.id)).not.toContain('parking')
    expect(DEFAULT_SIDEBAR_NAV_ORDER).not.toContain('parking')
  })

  it('shows parking only when pilot flag + order include it', () => {
    const order = [...DEFAULT_SIDEBAR_NAV_ORDER]
    const ticketsIdx = order.indexOf('tickets')
    order.splice(ticketsIdx + 1, 0, 'parking')

    const withoutFlag = resolveSidebarNavItems(order, null, undefined, null, {
      includeParkingPilot: false,
    })
    expect(withoutFlag.map((i) => i.id)).not.toContain('parking')

    const withFlag = resolveSidebarNavItems(order, null, undefined, null, {
      includeParkingPilot: true,
    })
    expect(withFlag.map((i) => i.id)).toContain('parking')
    expect(withFlag.find((i) => i.id === 'parking')?.label).toBe('חניונים')
  })
})
