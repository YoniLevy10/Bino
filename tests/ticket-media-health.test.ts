import { describe, expect, it } from 'vitest'

type Check = { id: string; ok: boolean }

function deriveStatus(checks: Check[], issues: string[]): 'ok' | 'degraded' | 'error' {
  const critical = ['db_tickets', 'db_attachments', 'storage_bucket']
  if (critical.some((id) => checks.find((c) => c.id === id && !c.ok))) return 'error'
  if (issues.length > 0) return 'degraded'
  return 'ok'
}

describe('ticket media health status', () => {
  it('returns error when critical DB check fails', () => {
    expect(
      deriveStatus(
        [
          { id: 'db_tickets', ok: false },
          { id: 'db_attachments', ok: true },
          { id: 'storage_bucket', ok: true },
        ],
        []
      )
    ).toBe('error')
  })

  it('returns degraded when non-critical issues exist', () => {
    expect(
      deriveStatus(
        [
          { id: 'db_tickets', ok: true },
          { id: 'db_attachments', ok: true },
          { id: 'storage_bucket', ok: true },
        ],
        ['טוקן פג תוקף']
      )
    ).toBe('degraded')
  })

  it('returns ok when all clear', () => {
    expect(deriveStatus([], [])).toBe('ok')
  })
})
