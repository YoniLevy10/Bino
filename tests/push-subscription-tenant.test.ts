import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('push-subscription-tenant', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('pushSubscriptionEndpoint reads endpoint from subscription JSON', async () => {
    const { pushSubscriptionEndpoint } = await import('@/lib/push-subscription-tenant')
    expect(pushSubscriptionEndpoint({ endpoint: 'https://fcm.example/x' })).toBe(
      'https://fcm.example/x'
    )
    expect(pushSubscriptionEndpoint({})).toBeNull()
    expect(pushSubscriptionEndpoint(null)).toBeNull()
  })

  it('revokePushEndpointFromOtherTenants deletes same endpoint on other tenants', async () => {
    const { revokePushEndpointFromOtherTenants } = await import('@/lib/push-subscription-tenant')
    const endpoint = 'https://fcm.example/shared'
    const managerDeleteIn = vi.fn(async () => ({ error: null }))
    const workerDeleteIn = vi.fn(async () => ({ error: null }))

    const admin = {
      from: vi.fn((table: string) => {
        if (table === 'push_subscriptions') {
          return {
            select: vi.fn(async () => ({
              data: [
                {
                  id: 'keep-m',
                  user_id: 'user-b',
                  client_id: 'client-b',
                  subscription: { endpoint },
                },
                {
                  id: 'drop-m',
                  user_id: 'user-a',
                  client_id: 'client-a',
                  subscription: { endpoint },
                },
                {
                  id: 'other',
                  user_id: 'user-c',
                  client_id: 'client-c',
                  subscription: { endpoint: 'https://other' },
                },
              ],
              error: null,
            })),
            delete: vi.fn(() => ({ in: managerDeleteIn })),
          }
        }
        if (table === 'worker_push_subscriptions') {
          return {
            select: vi.fn(async () => ({
              data: [
                {
                  id: 'drop-w',
                  worker_id: 'worker-a',
                  client_id: 'client-a',
                  subscription: { endpoint },
                },
              ],
              error: null,
            })),
            delete: vi.fn(() => ({ in: workerDeleteIn })),
          }
        }
        return {}
      }),
    }

    await revokePushEndpointFromOtherTenants(admin as never, {
      endpoint,
      keepManager: { userId: 'user-b', clientId: 'client-b' },
    })

    expect(managerDeleteIn).toHaveBeenCalledWith('id', ['drop-m'])
    expect(workerDeleteIn).toHaveBeenCalledWith('id', ['drop-w'])
  })

  it('upsertExclusiveManagerPushSubscription upserts then revokes endpoint elsewhere', async () => {
    const { upsertExclusiveManagerPushSubscription } = await import(
      '@/lib/push-subscription-tenant'
    )
    const upsert = vi.fn(async () => ({ error: null }))
    const managerDeleteIn = vi.fn(async () => ({ error: null }))
    const workerDeleteIn = vi.fn(async () => ({ error: null }))
    const endpoint = 'https://fcm.example/ep'

    const admin = {
      from: vi.fn((table: string) => {
        if (table === 'push_subscriptions') {
          return {
            upsert,
            select: vi.fn(async () => ({
              data: [
                {
                  id: 'old',
                  user_id: 'user-a',
                  client_id: 'client-a',
                  subscription: { endpoint },
                },
              ],
              error: null,
            })),
            delete: vi.fn(() => ({ in: managerDeleteIn })),
          }
        }
        return {
          select: vi.fn(async () => ({ data: [], error: null })),
          delete: vi.fn(() => ({ in: workerDeleteIn })),
        }
      }),
    }

    const result = await upsertExclusiveManagerPushSubscription(admin as never, {
      clientId: 'client-b',
      userId: 'user-b',
      subscription: { endpoint, keys: { p256dh: 'x', auth: 'y' } },
    })

    expect(result).toEqual({ ok: true })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-b',
        user_id: 'user-b',
      }),
      { onConflict: 'user_id,client_id' }
    )
    expect(managerDeleteIn).toHaveBeenCalledWith('id', ['old'])
  })
})
