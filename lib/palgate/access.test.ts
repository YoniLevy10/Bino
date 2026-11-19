import { describe, expect, it } from 'vitest'
import { clientRowHasPalGateCredentials } from '@/lib/palgate/access'

describe('clientRowHasPalGateCredentials', () => {
  it('requires enabled + all credential fields', () => {
    expect(
      clientRowHasPalGateCredentials({
        palgate_enabled: true,
        palgate_device_id: 'dev1',
        palgate_phone_number: '972501234567',
        palgate_session_token_hex: 'aabbccddeeff00112233445566778899',
        palgate_token_type: 'sms',
      })
    ).toBe(true)
    expect(
      clientRowHasPalGateCredentials({
        palgate_enabled: false,
        palgate_device_id: 'dev1',
        palgate_phone_number: '972501234567',
        palgate_session_token_hex: 'aabbccddeeff00112233445566778899',
        palgate_token_type: 'sms',
      })
    ).toBe(false)
    expect(
      clientRowHasPalGateCredentials({
        palgate_enabled: true,
        palgate_device_id: 'dev1',
        palgate_phone_number: '',
        palgate_session_token_hex: 'aabb',
        palgate_token_type: 'sms',
      })
    ).toBe(false)
  })
})
