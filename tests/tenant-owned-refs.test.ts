/**
 * Tenant ownership helpers — IDOR prevention when linking project/worker/ticket refs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertProjectOwnedByClient,
  assertWorkerOwnedByClient,
  assertTicketOwnedByClient,
} from '@/lib/tenant-owned-refs'

const CLIENT_A = 'client-a'
const CLIENT_B = 'client-b'

function makeAdmin(handlers: Record<string, () => unknown>) {
  return {
    from: (table: string) => {
      const handler = handlers[table]
      if (!handler) throw new Error(`unexpected table ${table}`)
      return handler()
    },
  } as never
}

function ownedMaybeSingle(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.is = vi.fn(self)
  chain.maybeSingle = vi.fn(async () => ({ data, error }))
  return chain
}

describe('assertProjectOwnedByClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows empty project id', async () => {
    const admin = makeAdmin({})
    await expect(assertProjectOwnedByClient(admin, CLIENT_A, null)).resolves.toEqual({ ok: true })
    await expect(assertProjectOwnedByClient(admin, CLIENT_A, '')).resolves.toEqual({ ok: true })
  })

  it('rejects project missing for tenant', async () => {
    const admin = makeAdmin({
      projects: () => ownedMaybeSingle(null),
    })
    const result = await assertProjectOwnedByClient(admin, CLIENT_A, 'proj-foreign')
    expect(result).toEqual({ ok: false, error: 'פרויקט לא נמצא בחשבון' })
  })

  it('accepts project owned by client', async () => {
    const admin = makeAdmin({
      projects: () => ownedMaybeSingle({ id: 'proj-1' }),
    })
    await expect(assertProjectOwnedByClient(admin, CLIENT_A, 'proj-1')).resolves.toEqual({
      ok: true,
    })
  })
})

describe('assertWorkerOwnedByClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects worker not in tenant', async () => {
    const admin = makeAdmin({
      workers: () => ownedMaybeSingle(null),
    })
    const result = await assertWorkerOwnedByClient(admin, CLIENT_A, 'worker-b')
    expect(result).toEqual({ ok: false, error: 'עובד לא נמצא בחשבון' })
  })

  it('rejects soft-deleted or inactive worker', async () => {
    const deletedAdmin = makeAdmin({
      workers: () =>
        ownedMaybeSingle({ id: 'w1', is_active: true, deleted_at: '2026-01-01T00:00:00Z' }),
    })
    expect(await assertWorkerOwnedByClient(deletedAdmin, CLIENT_A, 'w1')).toEqual({
      ok: false,
      error: 'עובד נמחק',
    })

    const inactiveAdmin = makeAdmin({
      workers: () => ownedMaybeSingle({ id: 'w1', is_active: false, deleted_at: null }),
    })
    expect(await assertWorkerOwnedByClient(inactiveAdmin, CLIENT_A, 'w1')).toEqual({
      ok: false,
      error: 'עובד אינו פעיל',
    })
  })

  it('accepts active worker in tenant', async () => {
    const admin = makeAdmin({
      workers: () => ownedMaybeSingle({ id: 'w1', is_active: true, deleted_at: null }),
    })
    await expect(assertWorkerOwnedByClient(admin, CLIENT_A, 'w1')).resolves.toEqual({ ok: true })
  })
})

describe('assertTicketOwnedByClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows empty ticket id', async () => {
    const admin = makeAdmin({})
    await expect(assertTicketOwnedByClient(admin, CLIENT_A, null)).resolves.toEqual({
      ok: true,
      ticketNumber: null,
      projectId: null,
    })
  })

  it('rejects foreign ticket (other client / missing)', async () => {
    const admin = makeAdmin({
      tickets: () => ownedMaybeSingle(null),
    })
    const result = await assertTicketOwnedByClient(admin, CLIENT_A, 'ticket-from-' + CLIENT_B)
    expect(result).toEqual({ ok: false, error: 'תקלה לא נמצאה בחשבון' })
  })

  it('returns ticket number + project when owned', async () => {
    const admin = makeAdmin({
      tickets: () => ownedMaybeSingle({ id: 't1', ticket_number: 42, project_id: 'p1' }),
    })
    await expect(assertTicketOwnedByClient(admin, CLIENT_A, 't1')).resolves.toEqual({
      ok: true,
      ticketNumber: 42,
      projectId: 'p1',
    })
  })
})
