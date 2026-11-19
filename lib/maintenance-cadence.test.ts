import { describe, expect, it } from 'vitest'
import {
  morningBucket,
  normalizeMaintenanceCadence,
  cadenceColor,
  MAINTENANCE_CADENCE_COLORS,
} from '@/lib/maintenance-cadence'

describe('maintenance-cadence', () => {
  it('normalizes unknown cadence to one_off', () => {
    expect(normalizeMaintenanceCadence('nope')).toBe('one_off')
    expect(normalizeMaintenanceCadence('weekly')).toBe('weekly')
  })

  it('maps cadence to fixed colors', () => {
    expect(cadenceColor('weekly')).toBe(MAINTENANCE_CADENCE_COLORS.weekly)
  })

  it('buckets due dates for morning board', () => {
    const now = new Date('2026-11-18T10:00:00+02:00')
    expect(morningBucket('2026-11-17T09:00:00+02:00', now)).toBe('overdue')
    expect(morningBucket('2026-11-18T15:00:00+02:00', now)).toBe('today')
    expect(morningBucket('2026-11-20T09:00:00+02:00', now)).toBe('week')
    expect(morningBucket('2026-12-01T09:00:00+02:00', now)).toBe('later')
    expect(morningBucket(null, now)).toBe(null)
  })
})
