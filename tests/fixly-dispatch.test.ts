import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mergeFixlyMetadata, readFixlyMetadata } from '@/lib/fixly-ticket-metadata'
import { authorizeFixlyWebhook } from '@/lib/fixly-client'
import { FIXLY_JOB_STATUSES } from '@/lib/fixly-types'

describe('fixly ticket metadata', () => {
  it('merges fixly job onto ticket_metadata without wiping other keys', () => {
    const next = mergeFixlyMetadata(
      { foo: 1 },
      {
        job_id: 'job-1',
        launched_at: '2026-01-01T00:00:00.000Z',
        last_status: 'open',
        trade: 'חשמל',
      }
    )
    expect(next).toMatchObject({
      foo: 1,
      fixly: {
        job_id: 'job-1',
        last_status: 'open',
        trade: 'חשמל',
      },
    })
    expect(readFixlyMetadata(next)?.job_id).toBe('job-1')
  })

  it('updates last_status through the claim → completed path', () => {
    let meta: unknown = mergeFixlyMetadata(null, {
      job_id: 'job-2',
      launched_at: '2026-01-01T00:00:00.000Z',
      last_status: 'open',
    })
    for (const status of ['claimed', 'en_route', 'arrived', 'in_progress', 'completed'] as const) {
      meta = mergeFixlyMetadata(meta, {
        job_id: 'job-2',
        launched_at: '2026-01-01T00:00:00.000Z',
        last_status: status,
        last_event_id: `evt-${status}`,
      })
    }
    expect(readFixlyMetadata(meta)?.last_status).toBe('completed')
    expect(readFixlyMetadata(meta)?.last_event_id).toBe('evt-completed')
  })

  it('covers expired / no-claim terminal status', () => {
    const meta = mergeFixlyMetadata(null, {
      job_id: 'job-3',
      launched_at: '2026-01-01T00:00:00.000Z',
      last_status: 'expired',
    })
    expect(readFixlyMetadata(meta)?.last_status).toBe('expired')
    expect(FIXLY_JOB_STATUSES).toContain('expired')
  })
})

describe('authorizeFixlyWebhook', () => {
  const prev = process.env.FIXLY_WEBHOOK_SECRET
  beforeEach(() => {
    process.env.FIXLY_WEBHOOK_SECRET = 'secret-1'
  })
  afterEach(() => {
    if (prev === undefined) delete process.env.FIXLY_WEBHOOK_SECRET
    else process.env.FIXLY_WEBHOOK_SECRET = prev
  })

  it('accepts matching query or header token', () => {
    expect(
      authorizeFixlyWebhook({
        expectedSecret: 'secret-1',
        tokenFromQuery: 'secret-1',
        tokenFromHeader: null,
      })
    ).toBe(true)
    expect(
      authorizeFixlyWebhook({
        expectedSecret: 'secret-1',
        tokenFromQuery: null,
        tokenFromHeader: 'secret-1',
      })
    ).toBe(true)
  })

  it('rejects missing or wrong secret', () => {
    expect(
      authorizeFixlyWebhook({
        expectedSecret: 'secret-1',
        tokenFromQuery: 'nope',
        tokenFromHeader: null,
      })
    ).toBe(false)
    expect(
      authorizeFixlyWebhook({
        expectedSecret: '',
        tokenFromQuery: 'secret-1',
        tokenFromHeader: null,
      })
    ).toBe(false)
  })
})

describe('createFixlyOpenJob stub', () => {
  it('returns stub job when Fixly env is unset', async () => {
    const prevUrl = process.env.FIXLY_API_URL
    const prevKey = process.env.FIXLY_API_KEY
    delete process.env.FIXLY_API_URL
    delete process.env.FIXLY_API_KEY
    vi.resetModules()
    const { createFixlyOpenJob } = await import('@/lib/fixly-client')
    const result = await createFixlyOpenJob({
      bino_ticket_id: '11111111-1111-1111-1111-111111111111',
      bino_ticket_number: 1,
      client_id: '22222222-2222-2222-2222-222222222222',
      project_id: '33333333-3333-3333-3333-333333333333',
      trade: 'אינסטלציה',
      description: 'נזילה',
      priority: 'HIGH',
      address: 'תל אביב',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.stub).toBe(true)
      expect(result.data.fixly_job_id).toMatch(/^stub-/)
      expect(result.data.status).toBe('open')
    }
    if (prevUrl === undefined) delete process.env.FIXLY_API_URL
    else process.env.FIXLY_API_URL = prevUrl
    if (prevKey === undefined) delete process.env.FIXLY_API_KEY
    else process.env.FIXLY_API_KEY = prevKey
  })
})
