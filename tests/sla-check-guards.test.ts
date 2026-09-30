import { describe, expect, it } from 'vitest'
import { readFixlyMetadata } from '@/lib/fixly-ticket-metadata'

/**
 * Mirrors the progressive-path guard used by sla-check and sla_unassigned detector.
 * Keeps the "no untreated claim without evidence" rule covered in unit tests.
 */
function hasProgressiveAlternative(opts: {
  forwardSmsOk: boolean
  escortLogged: boolean
  ticketMetadata: unknown
}): boolean {
  if (opts.forwardSmsOk || opts.escortLogged) return true
  const fixly = readFixlyMetadata(opts.ticketMetadata)
  const active = new Set(['claimed', 'assigned', 'en_route', 'arrived', 'in_progress', 'launched'])
  if (fixly && active.has(String(fixly.last_status))) return true
  return false
}

describe('SLA progressive path guards', () => {
  it('PROFESSIONAL_ESCORT status alone is not progressive evidence', () => {
    // Status is not even an input — logs / fixly required
    expect(
      hasProgressiveAlternative({
        forwardSmsOk: false,
        escortLogged: false,
        ticketMetadata: {},
      })
    ).toBe(false)
  })

  it('successful forward SMS counts as progressive', () => {
    expect(
      hasProgressiveAlternative({
        forwardSmsOk: true,
        escortLogged: false,
        ticketMetadata: {},
      })
    ).toBe(true)
  })

  it('worker escort log counts as progressive', () => {
    expect(
      hasProgressiveAlternative({
        forwardSmsOk: false,
        escortLogged: true,
        ticketMetadata: {},
      })
    ).toBe(true)
  })
})
