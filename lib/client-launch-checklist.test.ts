import { describe, expect, it } from 'vitest'
import {
  LAUNCH_PLAYBOOK_HEADER,
  LIVE_SMOKE_CHECKS,
  buildClientLaunchChecklist,
  type ClientLaunchSnapshot,
} from '@/lib/client-launch-checklist'

const base: ClientLaunchSnapshot = {
  clientName: 'Bamakor',
  adminEmail: 'a@b.com',
  whatsappPhoneNumberId: '123',
  whatsappAccessTokenSet: true,
  smsSenderName: '972559899132',
  managerPhone: '972548102688',
  growEnabled: true,
  growUserId: 'uid',
  growLegalReady: true,
  collectionsAddonEnabled: true,
  emailSlug: 'bamakor',
  emailFrom: 'Bamakor <bamakor@bino.casa>',
  buildingsCount: 1,
  workersActiveCount: 1,
  logoUrl: 'https://x/logo.png',
}

describe('LAUNCH_PLAYBOOK_HEADER', () => {
  it('lists 7 ordered live steps ending with live smoke', () => {
    expect(LAUNCH_PLAYBOOK_HEADER.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(LAUNCH_PLAYBOOK_HEADER[1]?.title).toMatch(/019/)
    expect(LAUNCH_PLAYBOOK_HEADER[2]?.title).toMatch(/Meta/)
    expect(LAUNCH_PLAYBOOK_HEADER[4]?.title).toMatch(/Grow|GetLink/i)
    expect(LAUNCH_PLAYBOOK_HEADER[6]?.title).toMatch(/בדיקות חיות|מקצה לקצה/)
  })

  it('exports live smoke checks for soft-launch', () => {
    expect(LIVE_SMOKE_CHECKS.length).toBeGreaterThanOrEqual(4)
    expect(LIVE_SMOKE_CHECKS.map((c) => c.id)).toContain('wa_inbound_ticket')
    expect(LIVE_SMOKE_CHECKS.map((c) => c.id)).toContain('grow_pay_1ils')
  })
})

describe('buildClientLaunchChecklist', () => {
  it('marks soft launch ready when core items ok', () => {
    const r = buildClientLaunchChecklist(base)
    expect(r.readyForSoftLaunch).toBe(true)
    expect(r.doneCount).toBe(r.totalCount)
  })

  it('blocks soft launch without WhatsApp paste and marks Meta external', () => {
    const r = buildClientLaunchChecklist({
      ...base,
      whatsappPhoneNumberId: null,
      whatsappAccessTokenSet: false,
    })
    expect(r.readyForSoftLaunch).toBe(false)
    expect(r.items.find((i) => i.id === 'connect_meta')?.status).toBe('external')
    expect(r.items.find((i) => i.id === 'paste_wa_id')?.status).toBe('todo')
    expect(r.items.find((i) => i.id === 'paste_wa_token')?.status).toBe('todo')
  })

  it('marks 019 buy as external until sender phone is pasted', () => {
    const r = buildClientLaunchChecklist({
      ...base,
      smsSenderName: null,
    })
    expect(r.items.find((i) => i.id === 'buy_019_number')?.status).toBe('external')
    expect(r.items.find((i) => i.id === 'paste_sms_sender')?.status).toBe('todo')
    expect(r.readyForSoftLaunch).toBe(false)
  })

  it('marks Grow GetLink external until userId exists', () => {
    const r = buildClientLaunchChecklist({
      ...base,
      growUserId: null,
      growEnabled: false,
    })
    expect(r.items.find((i) => i.id === 'grow_getlink')?.status).toBe('external')
  })
})
