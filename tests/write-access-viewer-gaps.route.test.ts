/**
 * Audit H5 / M9 — mutating API routes must reject viewer (VIEWER_READ_ONLY).
 * Mocks auth helpers the same way other route tests do.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { canOrgRoleWrite } from '@/lib/org-role'

function viewerDeniedResponse() {
  return NextResponse.json(
    { error: 'אין הרשאת כתיבה לתפקיד צופה', code: 'VIEWER_READ_ONLY' },
    { status: 403 }
  )
}

const managerCtx = {
  userId: 'user-manager',
  clientId: '11111111-1111-1111-1111-111111111111',
  admin: {} as never,
  role: 'manager' as const,
}

const viewerCtx = {
  userId: 'user-viewer',
  clientId: '11111111-1111-1111-1111-111111111111',
  admin: {} as never,
  role: 'viewer' as const,
}

vi.mock('@/lib/api-auth', () => ({
  requireSessionClientId: vi.fn(),
  requireSessionWriteAccess: vi.fn(),
}))

vi.mock('@/lib/require-paid-addon', () => ({
  requireSessionClientPaidAddon: vi.fn(),
  requireClientPaidAddon: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkAuthenticatedPostRouteLimit: vi.fn().mockResolvedValue({ isLimited: false }),
  checkAuthenticatedReadRouteLimit: vi.fn().mockResolvedValue({ isLimited: false }),
  checkIpPostRouteLimit: vi.fn().mockResolvedValue({ isLimited: false }),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: vi.fn() })),
}))

vi.mock('@/lib/plan-quota-check', () => ({
  checkTicketsMonthlyQuota: vi.fn().mockResolvedValue({ ok: true, current: 1, max: 100 }),
}))

vi.mock('@/lib/recommendations/record-event', () => ({
  recordRecommendationEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/logging', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getAuditLogger: () => ({
    logTicketCreated: vi.fn(),
    logFailedOperation: vi.fn(),
  }),
}))

import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/api-auth'
import { requireClientPaidAddon, requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { POST as dismissPost } from '@/app/api/recommendations/dismiss/route'
import { POST as snoozePost } from '@/app/api/recommendations/snooze/route'
import { POST as actionPost } from '@/app/api/recommendations/action/route'
import { POST as followUpPost } from '@/app/api/recommendations/set-professional-follow-up/route'
import { GET as shiftsGet, POST as shiftsPost } from '@/app/api/attendance/shifts/route'
import { POST as calendarEventsPost } from '@/app/api/calendar/events/route'
import { POST as smsCampaignsPost } from '@/app/api/sms/campaigns/route'
import { POST as waTemplatePost } from '@/app/api/whatsapp/send-template/route'
import { POST as createTicketPost } from '@/app/api/create-ticket/route'

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('canOrgRoleWrite (central gate used by API + tests)', () => {
  it('viewer false; manager/admin true', () => {
    expect(canOrgRoleWrite('viewer')).toBe(false)
    expect(canOrgRoleWrite('manager')).toBe(true)
    expect(canOrgRoleWrite('admin')).toBe(true)
  })
})

describe('recommendations mutating routes — write gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const cases: Array<{ name: string; post: (req: Request) => Promise<Response>; body: unknown }> = [
    {
      name: 'dismiss',
      post: dismissPost,
      body: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
    },
    {
      name: 'snooze',
      post: snoozePost,
      body: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        until: new Date(Date.now() + 86400000).toISOString(),
      },
    },
    {
      name: 'action',
      post: actionPost,
      body: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', action_id: 'open' },
    },
    {
      name: 'set-professional-follow-up',
      post: followUpPost,
      body: {
        ticket_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        follow_up_at: new Date(Date.now() + 86400000).toISOString(),
      },
    },
  ]

  for (const c of cases) {
    it(`${c.name}: viewer → 403 VIEWER_READ_ONLY`, async () => {
      vi.mocked(requireSessionWriteAccess).mockResolvedValue({
        ok: false,
        response: viewerDeniedResponse(),
      })
      const res = await c.post(jsonReq('http://localhost/api', c.body))
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('VIEWER_READ_ONLY')
      expect(requireSessionWriteAccess).toHaveBeenCalled()
    })

    it(`${c.name}: manager passes write auth (not VIEWER_READ_ONLY)`, async () => {
      vi.mocked(requireSessionWriteAccess).mockResolvedValue({
        ok: true,
        ctx: managerCtx,
      })
      const res = await c.post(jsonReq('http://localhost/api', c.body))
      // Auth cleared; downstream may 400/404/500 depending on mocks — must not be VIEWER_READ_ONLY
      if (res.status === 403) {
        const body = await res.json()
        expect(body.code).not.toBe('VIEWER_READ_ONLY')
      } else {
        expect(res.status).not.toBe(401)
      }
      expect(requireSessionWriteAccess).toHaveBeenCalled()
    })
  }
})

describe('attendance/shifts — GET read vs POST write', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireClientPaidAddon).mockResolvedValue({ ok: true })
  })

  it('GET still uses ClientId-only (viewer readable)', async () => {
    vi.mocked(requireClientPaidAddon).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ code: 'ADDON_REQUIRED' }, { status: 403 }),
    })
    vi.mocked(requireSessionClientId).mockResolvedValue({ ok: true, ctx: viewerCtx })
    const req = new Request('http://localhost/api/attendance/shifts') as import('next/server').NextRequest
    Object.defineProperty(req, 'nextUrl', {
      value: new URL('http://localhost/api/attendance/shifts'),
    })
    const res = await shiftsGet(req as never)
    expect(requireSessionClientId).toHaveBeenCalled()
    expect(requireSessionWriteAccess).not.toHaveBeenCalled()
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('ADDON_REQUIRED')
  })

  it('POST viewer → 403 VIEWER_READ_ONLY', async () => {
    vi.mocked(requireSessionWriteAccess).mockResolvedValue({
      ok: false,
      response: viewerDeniedResponse(),
    })
    const res = await shiftsPost(
      jsonReq('http://localhost/api/attendance/shifts', {
        worker_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        started_at: '2026-01-01T08:00:00.000Z',
      }) as never
    )
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('VIEWER_READ_ONLY')
  })

  it('POST manager passes write auth', async () => {
    vi.mocked(requireSessionWriteAccess).mockResolvedValue({ ok: true, ctx: managerCtx })
    vi.mocked(requireClientPaidAddon).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ code: 'ADDON_REQUIRED' }, { status: 403 }),
    })
    const res = await shiftsPost(
      jsonReq('http://localhost/api/attendance/shifts', {
        worker_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        started_at: '2026-01-01T08:00:00.000Z',
      }) as never
    )
    expect(requireSessionWriteAccess).toHaveBeenCalled()
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('ADDON_REQUIRED')
  })
})

describe('paid-addon mutating routes — write: true', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calendar/events POST: viewer denied via paid-addon write gate', async () => {
    vi.mocked(requireSessionClientPaidAddon).mockResolvedValue({
      ok: false,
      response: viewerDeniedResponse(),
    })
    const res = await calendarEventsPost(
      jsonReq('http://localhost/api/calendar/events', {
        title: 'בדיקה',
        starts_at: '2026-01-01T10:00:00.000Z',
        ends_at: '2026-01-01T11:00:00.000Z',
      })
    )
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('VIEWER_READ_ONLY')
    expect(requireSessionClientPaidAddon).toHaveBeenCalledWith(expect.anything(), { write: true })
  })

  it('calendar/events POST: manager allowed past auth', async () => {
    vi.mocked(requireSessionClientPaidAddon).mockResolvedValue({ ok: true, ctx: managerCtx })
    const res = await calendarEventsPost(
      jsonReq('http://localhost/api/calendar/events', {
        title: 'בדיקה',
        starts_at: '2026-01-01T10:00:00.000Z',
        ends_at: '2026-01-01T11:00:00.000Z',
      })
    )
    expect(requireSessionClientPaidAddon).toHaveBeenCalledWith(expect.anything(), { write: true })
    if (res.status === 403) {
      expect((await res.json()).code).not.toBe('VIEWER_READ_ONLY')
    }
  })

  it('sms/campaigns POST: viewer denied', async () => {
    vi.mocked(requireSessionClientPaidAddon).mockResolvedValue({
      ok: false,
      response: viewerDeniedResponse(),
    })
    const res = await smsCampaignsPost(
      jsonReq('http://localhost/api/sms/campaigns', {
        project_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        message_body: 'שלום',
        dry_run: true,
      })
    )
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('VIEWER_READ_ONLY')
    expect(requireSessionClientPaidAddon).toHaveBeenCalledWith(expect.anything(), { write: true })
  })

  it('sms/campaigns POST: manager allowed past auth', async () => {
    vi.mocked(requireSessionClientPaidAddon).mockResolvedValue({ ok: true, ctx: managerCtx })
    const res = await smsCampaignsPost(
      jsonReq('http://localhost/api/sms/campaigns', {
        project_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        message_body: 'שלום',
        dry_run: true,
      })
    )
    expect(requireSessionClientPaidAddon).toHaveBeenCalledWith(expect.anything(), { write: true })
    if (res.status === 403) {
      expect((await res.json()).code).not.toBe('VIEWER_READ_ONLY')
    }
  })

  it('whatsapp/send-template POST: viewer denied', async () => {
    vi.mocked(requireSessionClientPaidAddon).mockResolvedValue({
      ok: false,
      response: viewerDeniedResponse(),
    })
    const res = await waTemplatePost(
      jsonReq('http://localhost/api/whatsapp/send-template', {
        phone: '0501234567',
        template_id: 'hello',
        params: [],
      })
    )
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('VIEWER_READ_ONLY')
    expect(requireSessionClientPaidAddon).toHaveBeenCalledWith(expect.anything(), { write: true })
  })

  it('whatsapp/send-template POST: manager allowed past auth', async () => {
    vi.mocked(requireSessionClientPaidAddon).mockResolvedValue({ ok: true, ctx: managerCtx })
    const res = await waTemplatePost(
      jsonReq('http://localhost/api/whatsapp/send-template', {
        phone: '0501234567',
        template_id: 'hello',
        params: [],
      })
    )
    expect(requireSessionClientPaidAddon).toHaveBeenCalledWith(expect.anything(), { write: true })
    if (res.status === 403) {
      expect((await res.json()).code).not.toBe('VIEWER_READ_ONLY')
    }
  })
})

describe('create-ticket — session write vs public client_id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('session viewer → 403 VIEWER_READ_ONLY', async () => {
    vi.mocked(requireSessionClientId).mockResolvedValue({ ok: true, ctx: viewerCtx })
    const res = await createTicketPost(
      jsonReq('http://localhost/api/create-ticket', {
        project_code: 'BMKTEST',
        description: 'תקלה לבדיקה של צופה',
        source: 'web_form',
      })
    )
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('VIEWER_READ_ONLY')
  })

  it('session manager allowed past role gate', async () => {
    vi.mocked(requireSessionClientId).mockResolvedValue({ ok: true, ctx: managerCtx })
    const res = await createTicketPost(
      jsonReq('http://localhost/api/create-ticket', {
        project_code: 'BMKTEST',
        description: 'תקלה לבדיקה של מנהל',
        source: 'web_form',
      })
    )
    // May fail later on project lookup mock — must not be viewer-blocked
    if (res.status === 403) {
      expect((await res.json()).code).not.toBe('VIEWER_READ_ONLY')
    } else {
      expect([200, 404, 500]).toContain(res.status)
    }
  })

  it('public path with client_id still works without session', async () => {
    vi.mocked(requireSessionClientId).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 }),
    })
    const res = await createTicketPost(
      jsonReq('http://localhost/api/create-ticket', {
        client_id: managerCtx.clientId,
        project_code: 'BMKTEST',
        description: 'דיווח ציבורי ללא session',
        source: 'web_form',
      })
    )
    // Public path proceeds past auth; project mock may 500/404 — not 401/VIEWER_READ_ONLY
    expect(res.status).not.toBe(401)
    if (res.status === 403) {
      expect((await res.json()).code).not.toBe('VIEWER_READ_ONLY')
    }
  })
})
