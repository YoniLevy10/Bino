import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  clearWhatsAppTenantCache,
  resolveClientIdByWhatsAppPhoneNumberId,
} from '@/lib/tenant-resolution'

function makeAdmin(rows: Record<string, unknown>[] | null, error: unknown = null) {
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({ data: rows, error }),
    }),
  })

  return {
    from: vi.fn(() => ({ select })),
    __select: select,
  }
}

describe('resolveClientIdByWhatsAppPhoneNumberId cache', () => {
  beforeEach(() => {
    clearWhatsAppTenantCache()
  })

  it('returns cached tenant without a second DB query', async () => {
    const admin = makeAdmin([
      {
        id: 'client-1',
        name: 'Test',
        whatsapp_phone_number_id: '12345',
      },
    ])

    const first = await resolveClientIdByWhatsAppPhoneNumberId(admin as never, '12345')
    const second = await resolveClientIdByWhatsAppPhoneNumberId(admin as never, '12345')

    expect(first?.clientId).toBe('client-1')
    expect(second?.clientId).toBe('client-1')
    expect(admin.from).toHaveBeenCalledTimes(1)
  })

  it('clears cache between tests via clearWhatsAppTenantCache', async () => {
    const admin = makeAdmin([{ id: 'client-2', name: 'Other' }])
    await resolveClientIdByWhatsAppPhoneNumberId(admin as never, '999')
    clearWhatsAppTenantCache()
    await resolveClientIdByWhatsAppPhoneNumberId(admin as never, '999')
    expect(admin.from).toHaveBeenCalledTimes(2)
  })
})
