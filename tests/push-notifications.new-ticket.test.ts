import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendNotification = vi.fn()
const setVapidDetails = vi.fn()

vi.mock('web-push', () => ({
  default: {
    setVapidDetails,
    sendNotification,
  },
}))

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

  it('sends push to managers and workers with correct URLs', async () => {
    sendNotification.mockResolvedValue(undefined)
    const { notifyNewTicketPush } = await import('@/lib/push-notifications')
    const managerSub = { endpoint: 'https://fcm.googleapis.com/manager' }
    const workerSub = { endpoint: 'https://fcm.googleapis.com/worker' }
    const admin = {
      from: vi.fn((table: string) => {
        if (table === 'push_subscriptions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ id: 'm1', subscription: managerSub }],
                error: null,
              })),
            })),
            delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          }
        }
        if (table === 'worker_push_subscriptions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ id: 'w1', subscription: workerSub }],
                error: null,
              })),
            })),
            delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          }
        }
        return { select: vi.fn() }
      }),
    }

    await notifyNewTicketPush(admin as never, 'client-1', 'דלת שבורה', { ticketNumber: 42 })

    expect(setVapidDetails).toHaveBeenCalled()
    expect(sendNotification).toHaveBeenCalledTimes(2)

    const payloads = sendNotification.mock.calls.map(([, payload]) => JSON.parse(String(payload)))
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'טיקט חדש #42',
          url: '/tickets',
          tag: 'new-ticket-42',
        }),
        expect.objectContaining({
          title: 'טיקט חדש #42',
          url: '/worker',
          tag: 'worker-new-ticket-42',
        }),
      ])
    )
  })

  it('deletes expired manager subscriptions on 410', async () => {
    sendNotification.mockRejectedValue({ statusCode: 410 })
    const { notifyNewTicketPush } = await import('@/lib/push-notifications')
    const deleteEq = vi.fn(async () => ({ error: null }))
    const admin = {
      from: vi.fn((table: string) => {
        if (table === 'push_subscriptions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ id: 'dead-sub', subscription: { endpoint: 'https://x' } }],
                error: null,
              })),
            })),
            delete: vi.fn(() => ({ eq: deleteEq })),
          }
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }),
    }

    await notifyNewTicketPush(admin as never, 'client-1', 'בדיקה', { ticketNumber: 7 })
    expect(deleteEq).toHaveBeenCalledWith('id', 'dead-sub')
  })
})
