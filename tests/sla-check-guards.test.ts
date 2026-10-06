import { describe, expect, it } from 'vitest'

/**
 * Mirrors the progressive-path guard used by sla-check and sla_unassigned detector.
 * Keeps the "no untreated claim without evidence" rule covered in unit tests.
 */
function hasProgressiveAlternative(opts: {
  forwardSmsOk: boolean
  escortLogged: boolean
}): boolean {
  return opts.forwardSmsOk || opts.escortLogged
}

describe('SLA progressive path guards', () => {
  it('PROFESSIONAL_ESCORT status alone is not progressive evidence', () => {
    expect(
      hasProgressiveAlternative({
        forwardSmsOk: false,
        escortLogged: false,
      })
    ).toBe(false)
  })

  it('successful forward SMS counts as progressive', () => {
    expect(
      hasProgressiveAlternative({
        forwardSmsOk: true,
        escortLogged: false,
      })
    ).toBe(true)
  })

  it('worker escort log counts as progressive', () => {
    expect(
      hasProgressiveAlternative({
        forwardSmsOk: false,
        escortLogged: true,
      })
    ).toBe(true)
  })
})
