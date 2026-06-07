import { describe, expect, it } from 'vitest'
import { navItemIdForPathname } from '@/lib/client-nav-features'

describe('navItemIdForPathname', () => {
  it('maps dedicated add-on pages to nav ids', () => {
    expect(navItemIdForPathname('/pilot-sms')).toBe('pilot_sms')
    expect(navItemIdForPathname('/project-documents')).toBe('project_documents')
    expect(navItemIdForPathname('/calendar')).toBe('calendar')
    expect(navItemIdForPathname('/attendance')).toBe('attendance')
    expect(navItemIdForPathname('/professionals')).toBe('professionals')
  })
})
