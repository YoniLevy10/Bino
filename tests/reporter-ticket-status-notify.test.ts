import { describe, expect, it } from 'vitest'
import {
  RESIDENT_STATUS_NOTIFY_LOG_ACTION,
  RESIDENT_STATUS_NOTIFY_WHITELIST,
} from '@/lib/reporter-ticket-status-notify'

describe('resident status WA whitelist', () => {
  it('allows only IN_PROGRESS and WAITING_PARTS', () => {
    expect([...RESIDENT_STATUS_NOTIFY_WHITELIST].sort()).toEqual(
      ['IN_PROGRESS', 'WAITING_PARTS'].sort()
    )
  })

  it('uses stable timeline action for idempotency + UI label', () => {
    expect(RESIDENT_STATUS_NOTIFY_LOG_ACTION).toBe('RESIDENT_STATUS_NOTIFY')
  })
})
