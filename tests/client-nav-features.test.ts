import { describe, expect, it } from 'vitest'
import { isNavFeatureEnabled } from '@/lib/client-nav-features'
import { resolveSidebarNavItems } from '@/lib/sidebar-nav'

describe('client nav features', () => {
  it('null enabled list allows all features', () => {
    expect(isNavFeatureEnabled(null, 'calendar')).toBe(true)
  })

  it('filters sidebar items when enabled list is set', () => {
    const items = resolveSidebarNavItems(null, ['dashboard', 'tickets', 'projects'])
    expect(items.map((i) => i.id)).toEqual(['dashboard', 'tickets', 'projects'])
  })

  it('blocks calendar when not in enabled list', () => {
    expect(isNavFeatureEnabled(['dashboard', 'tickets'], 'calendar')).toBe(false)
  })
})
