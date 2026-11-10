/**
 * Cross-tenant IDOR gates on mutating ticket APIs (CODE_ONLY closeout Task 6).
 * Manager session scoped to client A must get 404 (not mutate) for a foreign ticket id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWN_CLIENT_ID = 'a1111111-1111-4111-8111-111111111111'
const FOREIGN_TICKET_ID = '42fc65a0-3d04-4424-ab8b-8d62d280c69a'
const WORKER_ID = '11111111-1111-4111-8111-111111111111'

const requireSessionWriteAccess = vi.fn()
const eqCalls: Array<{ table: string; column: string; value: unknown }> = []

function ticketsMissChain(table: string) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = vi.fn(self)
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ table, column, value })
    return chain
  })
  chain.is = vi.fn(self)
  chain.single = vi.fn(async () => ({
    data: null,
    error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
  }))
  return chain
}

vi.mock('@/lib/api-auth', () => ({
  requireSessionWriteAccess: (...args: unknown[]) => requireSessionWriteAccess(...args),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: (table: string) => ticketsMissChain(table),
  })),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkAuthenticatedPostRouteLimit: vi.fn(async () => ({ isLimited: false })),
}))

vi.mock('@/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  getAuditLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    logFailedOperation: vi.fn(),
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
  notifyReporterTicketClosed: vi.fn(),
}))

vi.mock('@/lib/reporter-ticket-status-notify', () => ({
  notifyReporterOnStatusChange: vi.fn(),
}))

vi.mock('@/lib/tenant-owned-refs', () => ({
  assertWorkerOwnedByClient: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/assign-ticket-worker', () => ({
  assignTicketToWorker: vi.fn(),
}))

vi.mock('@/lib/sms-send', () => ({
  sendManagerSMS: vi.fn(),
  getManagerPhoneFromEnv: vi.fn(() => null),
}))

vi.mock('@/lib/whatsapp-templates', () => ({
  resolveSmsTemplateMessage: vi.fn(),
}))

vi.mock('@/lib/whatsapp-template-keys', () => ({
  SMS_TEMPLATE_EDITOR_DEFAULTS: {},
}))

import { POST as updateTicketPost } from '@/app/api/update-ticket/route'
import { POST as assignTicketPost } from '@/app/api/assign-ticket/route'
import { POST as closeTicketPost } from '@/app/api/close-ticket/route'

const managerAuth = {
  ok: true as const,
  ctx: {
    userId: 'user-manager',
    clientId: OWN_CLIENT_ID,
    admin: {} as never,
    role: 'manager' as const,
  },
}

describe('ticket mutating routes — cross-tenant IDOR', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqCalls.length = 0
    requireSessionWriteAccess.mockResolvedValue(managerAuth)
  })

  it('POST /api/update-ticket returns 404 for foreign ticket id (client_id filter)', async () => {
    const res = await updateTicketPost(
      new Request('http://localhost/api/update-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: FOREIGN_TICKET_ID,
          status: 'IN_PROGRESS',
        }),
      })
    )

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Ticket not found')
    expect(eqCalls).toContainEqual({
      table: 'tickets',
      column: 'client_id',
      value: OWN_CLIENT_ID,
    })
    expect(eqCalls).toContainEqual({
      table: 'tickets',
      column: 'id',
      value: FOREIGN_TICKET_ID,
    })
  })

  it('POST /api/assign-ticket returns 404 for foreign ticket id (client_id filter)', async () => {
    const res = await assignTicketPost(
      new Request('http://localhost/api/assign-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: FOREIGN_TICKET_ID,
          worker_id: WORKER_ID,
        }),
      })
    )

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Ticket not found')
    expect(eqCalls).toContainEqual({
      table: 'tickets',
      column: 'client_id',
      value: OWN_CLIENT_ID,
    })
  })

  it('POST /api/close-ticket returns 404 for foreign ticket id (client_id filter)', async () => {
    const res = await closeTicketPost(
      new Request('http://localhost/api/close-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: FOREIGN_TICKET_ID,
        }),
      })
    )

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Ticket not found')
    expect(eqCalls).toContainEqual({
      table: 'tickets',
      column: 'client_id',
      value: OWN_CLIENT_ID,
    })
  })
})
