import { describe, expect, it } from 'vitest'
import { isGoogleCalendarSyncConfigured } from '@/lib/google-calendar'

describe('google calendar sync config', () => {
  it('reports not configured without Google OAuth env', () => {
    const prevId = process.env.GOOGLE_CLIENT_ID
    const prevSecret = process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    expect(isGoogleCalendarSyncConfigured()).toBe(false)
    process.env.GOOGLE_CLIENT_ID = prevId
    process.env.GOOGLE_CLIENT_SECRET = prevSecret
  })

  it('reports configured when both env vars are set', () => {
    const prevId = process.env.GOOGLE_CLIENT_ID
    const prevSecret = process.env.GOOGLE_CLIENT_SECRET
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    expect(isGoogleCalendarSyncConfigured()).toBe(true)
    process.env.GOOGLE_CLIENT_ID = prevId
    process.env.GOOGLE_CLIENT_SECRET = prevSecret
  })
})
