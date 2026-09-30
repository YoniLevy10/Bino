import { describe, expect, it } from 'vitest'
import {
  SANDBOX_ADMIN_EMAIL,
  SANDBOX_CLIENT_NAME,
  SANDBOX_PROJECT_CODE,
} from '@/lib/sandbox-lab'

describe('sandbox lab constants', () => {
  it('uses a dedicated client name and plus-address admin email', () => {
    expect(SANDBOX_CLIENT_NAME).toBe('BINO Sandbox')
    expect(SANDBOX_ADMIN_EMAIL).toContain('+sandbox@')
    expect(SANDBOX_PROJECT_CODE).toBe('SANDBOX01')
  })
})
