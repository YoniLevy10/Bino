/**
 * Update-ticket must use write access (manager/admin) — viewer rejected.
 * Extends existing CI coverage for ticket update without new test infra.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const requireSessionWriteAccess = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  requireSessionWriteAccess: (...args: unknown[]) => requireSessionWriteAccess(...args),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkAuthenticatedPostRouteLimit: vi.fn(async () => ({ isLimited: false })),
}))

vi.mock('@/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  getAuditLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}))

vi.mock('@/lib/run-after-response', () => ({
  runAfterResponse: vi.fn(),
  shouldSyncTicketNotifications: () => false,
}))

vi.mock('@/lib/reporter-ticket-closed-notify', () => ({
  notifyReporterIfTicketNewlyClosed: vi.fn(),
}))

vi.mock('@/lib/reporter-ticket-status-notify', () => ({
  notifyReporterOnStatusChange: vi.fn(),
}))

vi.mock('@/lib/tenant-owned-refs', () => ({
  assertWorkerOwnedByClient: vi.fn(async () => undefined),
}))

import { POST } from '@/app/api/update-ticket/route'

describe('POST /api/update-ticket — write access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects viewer with VIEWER_READ_ONLY', async () => {
    requireSessionWriteAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: 'אין הרשאת כתיבה לתפקיד צופה', code: 'VIEWER_READ_ONLY' },
        { status: 403 }
      ),
    })

    const res = await POST(
      new Request('http://localhost/api/update-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: '00000000-0000-0000-0000-000000000001',
          status: 'in_progress',
        }),
      })
    )

    expect(requireSessionWriteAccess).toHaveBeenCalled()
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('VIEWER_READ_ONLY')
  })
})
