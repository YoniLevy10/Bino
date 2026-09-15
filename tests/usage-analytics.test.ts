import { describe, expect, it } from 'vitest'
import { navIdFromPathname } from '@/lib/nav-from-pathname'

describe('navIdFromPathname', () => {
  it('maps core dashboard routes', () => {
    expect(navIdFromPathname('/')).toBeNull()
    expect(navIdFromPathname('/dashboard')).toBe('dashboard')
    expect(navIdFromPathname('/tickets')).toBe('tickets')
    expect(navIdFromPathname('/projects')).toBe('projects')
    expect(navIdFromPathname('/residents')).toBe('residents')
    expect(navIdFromPathname('/workers')).toBe('workers')
    expect(navIdFromPathname('/summary')).toBe('summary')
  })

  it('maps settings and addons', () => {
    expect(navIdFromPathname('/settings')).toBe('settings')
    expect(navIdFromPathname('/settings/whatsapp-templates')).toBe('whatsapp_templates')
    expect(navIdFromPathname('/addons')).toBe('addons')
    expect(navIdFromPathname('/billing')).toBe('billing')
  })

  it('skips auth and platform routes', () => {
    expect(navIdFromPathname('/login')).toBeNull()
    expect(navIdFromPathname('/superadmin')).toBeNull()
    expect(navIdFromPathname('/admin/setup')).toBeNull()
    expect(navIdFromPathname('/api/tickets')).toBeNull()
  })

  it('maps premium addon routes', () => {
    expect(navIdFromPathname('/calendar')).toBe('calendar')
    expect(navIdFromPathname('/attendance')).toBe('attendance')
    expect(navIdFromPathname('/whatsapp-inbox')).toBe('whatsapp_inbox')
    expect(navIdFromPathname('/campaigns')).toBe('campaigns')
    expect(navIdFromPathname('/collections')).toBe('collections')
  })
})
