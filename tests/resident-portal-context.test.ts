import { describe, expect, it } from 'vitest'
import { assertMembershipScope } from '@/lib/resident-portal/context'
import { isAnnouncementVisibleNow } from '@/lib/resident-portal/jerusalem-time'
import { hashInviteToken, normalizeInviteEmail } from '@/lib/resident-portal/crypto'
import { isResidentPortalApiPath, isResidentPortalPath } from '@/lib/is-resident-portal-path'
import { residentDocumentDisplayName } from '@/lib/resident-portal/document-display'
import type { ResidentPortalMembershipView } from '@/lib/resident-portal/types'

const baseMembership: ResidentPortalMembershipView = {
  id: 'm1',
  user_id: 'u1',
  resident_id: 'r1',
  unit_id: 'unit1',
  client_id: 'c1',
  project_id: 'p1',
  role: 'owner',
  status: 'active',
  valid_from: new Date().toISOString(),
  valid_to: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  revoked_at: null,
  resident_name: 'ישראל',
  apartment_number: '12',
  project_name: 'בניין א',
  project_city: 'חיפה',
  client_name: 'ניהול',
  client_logo_url: null,
  portal_enabled: true,
}

describe('resident portal isolation helpers', () => {
  it('rejects cross-client claimed ids', () => {
    const r = assertMembershipScope(baseMembership, { client_id: 'other-client' })
    expect(r.ok).toBe(false)
  })

  it('allows matching scope hints', () => {
    const r = assertMembershipScope(baseMembership, {
      client_id: 'c1',
      project_id: 'p1',
      resident_id: 'r1',
      unit_id: 'unit1',
    })
    expect(r.ok).toBe(true)
  })

  it('hashes invite tokens stably', () => {
    expect(hashInviteToken('abc')).toBe(hashInviteToken('abc'))
    expect(hashInviteToken('abc')).not.toBe(hashInviteToken('abd'))
  })

  it('normalizes invite emails', () => {
    expect(normalizeInviteEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
  })

  it('detects resident paths', () => {
    expect(isResidentPortalPath('/resident')).toBe(true)
    expect(isResidentPortalPath('/resident/payments')).toBe(true)
    expect(isResidentPortalPath('/dashboard')).toBe(false)
    expect(isResidentPortalApiPath('/api/resident/home')).toBe(true)
  })

  it('humanizes document filenames for residents', () => {
    expect(residentDocumentDisplayName('Bamakor_Residents_Notice.pdf')).toBe(
      'Bamakor Residents Notice'
    )
    expect(residentDocumentDisplayName('שעות-בריכה.pdf')).toBe('שעות בריכה')
  })
})

describe('announcement visibility (Israel time semantics via Date)', () => {
  it('hides drafts and expired', () => {
    const now = new Date('2026-09-30T10:00:00.000Z')
    expect(
      isAnnouncementVisibleNow({
        status: 'draft',
        publish_at: null,
        published_at: null,
        expires_at: null,
        now,
      })
    ).toBe(false)
    expect(
      isAnnouncementVisibleNow({
        status: 'published',
        publish_at: '2026-09-01T00:00:00.000Z',
        published_at: '2026-09-01T00:00:00.000Z',
        expires_at: '2026-09-29T00:00:00.000Z',
        now,
      })
    ).toBe(false)
    expect(
      isAnnouncementVisibleNow({
        status: 'published',
        publish_at: '2026-09-01T00:00:00.000Z',
        published_at: '2026-09-01T00:00:00.000Z',
        expires_at: '2026-10-01T00:00:00.000Z',
        now,
      })
    ).toBe(true)
  })
})
