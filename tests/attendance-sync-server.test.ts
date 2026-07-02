import { describe, it, expect } from 'vitest'
import {
  computeSyncDelayMinutes,
  evaluateClientTimestamp,
  resolveEventTypeForTag,
} from '@/lib/attendance-sync-server'
import { ATTENDANCE_SYNC_DELAY_REVIEW_MINUTES } from '@/lib/attendance-types'

describe('attendance-sync-server', () => {
  it('computeSyncDelayMinutes returns minutes between client and server', () => {
    const server = new Date('2026-06-04T12:00:00Z')
    const client = '2026-06-04T11:30:00Z'
    expect(computeSyncDelayMinutes(client, server)).toBe(30)
  })

  it('evaluateClientTimestamp flags future client time', () => {
    const server = new Date('2026-06-04T12:00:00Z')
    const client = '2026-06-04T14:00:00Z'
    const r = evaluateClientTimestamp(client, server)
    expect(r.force_review).toBe(true)
    expect(r.suspicious_reason).toContain('client_time_in_future')
  })

  it('evaluateClientTimestamp flags sync delay over 6 hours', () => {
    const server = new Date('2026-06-04T18:00:00Z')
    const client = '2026-06-04T10:00:00Z'
    const r = evaluateClientTimestamp(client, server)
    expect(r.sync_delay_minutes).toBeGreaterThan(ATTENDANCE_SYNC_DELAY_REVIEW_MINUTES)
    expect(r.force_review).toBe(true)
    expect(r.suspicious_reason).toContain('sync_delay_over_6h')
  })

  it('resolveEventTypeForTag toggles clock in/out for office and project', () => {
    expect(resolveEventTypeForTag('office', false)).toBe('clock_in')
    expect(resolveEventTypeForTag('office', true)).toBe('clock_out')
    expect(resolveEventTypeForTag('project', false)).toBe('clock_in')
    expect(resolveEventTypeForTag('project', true)).toBe('clock_out')
  })
})
