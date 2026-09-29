import { describe, expect, it } from 'vitest'
import { buildClientLaunchChecklist, type ClientLaunchSnapshot } from '@/lib/client-launch-checklist'

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

describe('buildClientLaunchChecklist', () => {
  it('marks soft launch ready when core items ok', () => {
    const r = buildClientLaunchChecklist(base)
    expect(r.readyForSoftLaunch).toBe(true)
    expect(r.doneCount).toBe(r.totalCount)
  })

  it('blocks soft launch without WhatsApp', () => {
    const r = buildClientLaunchChecklist({
      ...base,
      whatsappPhoneNumberId: null,
      whatsappAccessTokenSet: false,
    })
    expect(r.readyForSoftLaunch).toBe(false)
    expect(r.items.find((i) => i.id === 'whatsapp_phone')?.status).toBe('external')
  })
})
