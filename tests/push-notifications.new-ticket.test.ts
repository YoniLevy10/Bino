import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendNotification = vi.fn()
const setVapidDetails = vi.fn()

vi.mock('web-push', () => ({
  default: {
    setVapidDetails,
    sendNotification,
  },
}))

function mockAdmin(opts: {
  clientName?: string | null
  managerRows?: { id: string; subscription: unknown }[]
  workerRows?: { id: string; subscription: unknown }[]
  deleteEq?: ReturnType<typeof vi.fn>
}) {
  const deleteEq = opts.deleteEq ?? vi.fn(async () => ({ error: null }))
  return {
    from: vi.fn((table: string) => {
      if (table === 'clients') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data:
                  opts.clientName === null || opts.clientName === undefined
                    ? null
                    : { name: opts.clientName },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === 'push_subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: opts.managerRows ?? [],
              error: null,
            })),
          })),
          delete: vi.fn(() => ({ eq: deleteEq })),
        }
      }
      if (table === 'worker_push_subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: opts.workerRows ?? [],
              error: null,
            })),
          })),
          delete: vi.fn(() => ({ eq: deleteEq })),
        }
      }
      return { select: vi.fn() }
    }),
    deleteEq,
  }
}

describe('notifyNewTicketPush', () => {
  beforeEach(() => {
    vi.resetModules()
    sendNotification.mockReset()
    setVapidDetails.mockReset()
    process.env.VAPID_PUBLIC_KEY = 'pub'
    process.env.VAPID_PRIVATE_KEY = 'priv'
    process.env.VAPID_SUBJECT = 'mailto:test@example.com'
  })

  it('no-ops when VAPID keys are missing', async () => {
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    const { notifyNewTicketPush } = await import('@/lib/push-notifications')
    const from = vi.fn()
    await notifyNewTicketPush({ from } as never, 'client-1', 'נזילה')
    expect(from).not.toHaveBeenCalled()
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('scopes queries to client_id and includes client name in title', async () => {
    sendNotification.mockResolvedValue(undefined)
    const { notifyNewTicketPush } = await import('@/lib/push-notifications')
    const managerSub = { endpoint: 'https://fcm.googleapis.com/manager' }
    const workerSub = { endpoint: 'https://fcm.googleapis.com/worker' }
    const admin = mockAdmin({
      clientName: 'ועד בית אלון',
      managerRows: [{ id: 'm1', subscription: managerSub }],
      workerRows: [{ id: 'w1', subscription: workerSub }],
    })

    await notifyNewTicketPush(admin as never, 'client-1', 'דלת שבורה', { ticketNumber: 42 })

    expect(setVapidDetails).toHaveBeenCalled()
    expect(sendNotification).toHaveBeenCalledTimes(2)

    // client_id filter on both subscription tables
    const pushSelectCalls = (admin.from as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([t]) => t === 'push_subscriptions' || t === 'worker_push_subscriptions'
    )
    expect(pushSelectCalls.length).toBe(2)

    const payloads = sendNotification.mock.calls.map(([, payload]) => JSON.parse(String(payload)))
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'טיקט חדש #42 · ועד בית אלון',
          url: '/tickets',
          tag: 'new-ticket-client-1-42',
        }),
        expect.objectContaining({
          title: 'טיקט חדש #42 · ועד בית אלון',
          url: '/worker',
          tag: 'worker-new-ticket-client-1-42',
        }),
      ])
    )
  })

  it('deletes expired manager subscriptions on 410', async () => {
    sendNotification.mockRejectedValue({ statusCode: 410 })
    const { notifyNewTicketPush } = await import('@/lib/push-notifications')
    const deleteEq = vi.fn(async () => ({ error: null }))
    const admin = mockAdmin({
      clientName: 'לקוח',
      managerRows: [{ id: 'dead-sub', subscription: { endpoint: 'https://x' } }],
      workerRows: [],
      deleteEq,
    })

    await notifyNewTicketPush(admin as never, 'client-1', 'בדיקה', { ticketNumber: 7 })
    expect(deleteEq).toHaveBeenCalledWith('id', 'dead-sub')
  })
})
