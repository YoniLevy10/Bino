import { describe, expect, it } from 'vitest'
import {
  absoluteBuildingDecisionInviteUrl,
  buildBuildingDecisionShareMessage,
  buildWhatsAppTextShareUrl,
  normalizeWhatsAppGroupInviteUrl,
} from './whatsapp-building-share'

describe('normalizeWhatsAppGroupInviteUrl', () => {
  it('accepts chat.whatsapp.com invite links', () => {
    expect(normalizeWhatsAppGroupInviteUrl('https://chat.whatsapp.com/AbCdEf123')).toBe(
      'https://chat.whatsapp.com/AbCdEf123'
    )
    expect(normalizeWhatsAppGroupInviteUrl('chat.whatsapp.com/AbCdEf123')).toBe(
      'https://chat.whatsapp.com/AbCdEf123'
    )
  })

  it('rejects non-invite hosts and empty paths', () => {
    expect(normalizeWhatsAppGroupInviteUrl('https://wa.me/972501234567')).toBeNull()
    expect(normalizeWhatsAppGroupInviteUrl('https://chat.whatsapp.com/')).toBeNull()
    expect(normalizeWhatsAppGroupInviteUrl('')).toBeNull()
    expect(normalizeWhatsAppGroupInviteUrl(null)).toBeNull()
  })
})

describe('buildWhatsAppTextShareUrl', () => {
  it('encodes message for api.whatsapp.com', () => {
    const url = buildWhatsAppTextShareUrl('שלום\nקישור')
    expect(url.startsWith('https://api.whatsapp.com/send?text=')).toBe(true)
    expect(url).toContain(encodeURIComponent('שלום\nקישור'))
  })
})

describe('buildBuildingDecisionShareMessage', () => {
  it('includes building, title, and invite url', () => {
    const msg = buildBuildingDecisionShareMessage({
      projectName: 'הרצל 12',
      decisionTitle: 'תיקון מעלית',
      inviteUrl: 'https://bino.casa/resident/join/abc?next=%2Fresident%2Fdecisions',
    })
    expect(msg).toContain('הרצל 12')
    expect(msg).toContain('תיקון מעלית')
    expect(msg).toContain('https://bino.casa/resident/join/abc')
  })
})

describe('absoluteBuildingDecisionInviteUrl', () => {
  it('builds absolute invite path under given origin', () => {
    const url = absoluteBuildingDecisionInviteUrl({
      projectId: '11111111-1111-1111-1111-111111111111',
      decisionId: '22222222-2222-2222-2222-222222222222',
      baseUrl: 'https://bino.casa',
    })
    expect(url.startsWith('https://bino.casa/resident/join/')).toBe(true)
    expect(url).toContain(encodeURIComponent('/resident/decisions?decision=22222222-2222-2222-2222-222222222222'))
  })
})
