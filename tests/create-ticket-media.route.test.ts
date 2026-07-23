import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_CLIENT_ID = '11111111-1111-1111-1111-111111111111'
const TEST_PROJECT_ID = '22222222-2222-2222-2222-222222222222'
const TEST_TICKET_ID = '33333333-3333-3333-3333-333333333333'

const uploadedStoragePaths: string[] = []
const insertedAttachments: Array<Record<string, unknown>> = []

vi.mock('@/lib/api-auth', () => ({
  requireSessionClientId: vi.fn().mockResolvedValue({ ok: false, response: null }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkAuthenticatedPostRouteLimit: vi.fn(),
  checkIpPostRouteLimit: vi.fn().mockResolvedValue({ isLimited: false }),
}))

vi.mock('@/lib/plan-quota-check', () => ({
  checkTicketsMonthlyQuota: vi.fn().mockResolvedValue({ ok: true, current: 1, max: 100 }),
}))

vi.mock('@/lib/assign-ticket-worker', () => ({
  autoAssignTicketFromProject: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/push-notifications', () => ({
  notifyNewTicketPush: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: TEST_PROJECT_ID,
                      name: 'בניין בדיקה',
                      project_code: 'BMKTEST',
                      client_id: TEST_CLIENT_ID,
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }

      if (table === 'tickets') {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: TEST_TICKET_ID,
                    ticket_number: 9001,
                    project_id: TEST_PROJECT_ID,
                    status: 'NEW',
                    building_number: null,
                  },
                  error: null,
                }),
            }),
          }),
        }
      }

      if (table === 'ticket_logs') {
        return {
          insert: () => Promise.resolve({ error: null }),
        }
      }

      if (table === 'ticket_attachments') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedAttachments.push(row)
            return Promise.resolve({ error: null })
          },
        }
      }

      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { sms_sender_name: null }, error: null }),
            }),
          }),
        }
      }

      throw new Error(`unexpected table in create-ticket media test: ${table}`)
    },
    storage: {
      from: () => ({
        upload: (filePath: string) => {
          uploadedStoragePaths.push(filePath)
          return Promise.resolve({ error: null })
        },
        remove: () => Promise.resolve({ error: null }),
      }),
    },
  }),
}))

import { POST } from '@/app/api/create-ticket/route'

function fixture(name: string): Buffer {
  return readFileSync(path.join(process.cwd(), 'tests/fixtures', name))
}

async function postWebFormTicket(files: File[]) {
  const form = new FormData()
  form.append('client_id', TEST_CLIENT_ID)
  form.append('project_code', 'BMKTEST')
  form.append('description', 'דליפה במטבח — בדיקת מדיה')
  form.append('source', 'web_form')
  for (const file of files) {
    form.append('attachments', file)
  }

  const req = new Request('http://localhost/api/create-ticket', {
    method: 'POST',
    body: form,
  })

  return POST(req)
}

describe('POST /api/create-ticket — web form media', () => {
  beforeEach(() => {
    uploadedStoragePaths.length = 0
    insertedAttachments.length = 0
  })

  it('creates ticket and uploads image + video attachments', async () => {
    const png = fixture('test-image.png')
    const mp4 = fixture('test-video.mp4')

    const res = await postWebFormTicket([
      new File([new Uint8Array(png)], 'test-image.png', { type: 'image/png' }),
      new File([new Uint8Array(mp4)], 'test-video.mp4', { type: 'video/mp4' }),
    ])

    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      success?: boolean
      ticketNumber?: number
      ticketId?: string
      imageUploadWarning?: string
    }

    expect(json.success).toBe(true)
    expect(json.ticketNumber).toBe(9001)
    expect(json.ticketId).toBe(TEST_TICKET_ID)
    expect(json.imageUploadWarning).toBeUndefined()

    expect(uploadedStoragePaths).toHaveLength(2)
    expect(uploadedStoragePaths.every((p) => p.startsWith(`${TEST_TICKET_ID}/`))).toBe(true)

    expect(insertedAttachments).toHaveLength(2)
    expect(insertedAttachments.map((a) => a.mime_type).sort()).toEqual([
      'image/png',
      'video/mp4',
    ])
    expect(insertedAttachments.map((a) => a.attachment_type).sort()).toEqual([
      'web_upload',
      'web_upload_video',
    ])
  })

  it('creates ticket even when one attachment fails validation', async () => {
    const png = fixture('test-image.png')

    const res = await postWebFormTicket([
      new File([new Uint8Array(png)], 'ok.png', { type: 'image/png' }),
      new File([new Uint8Array(10)], 'bad.exe', { type: 'application/x-msdownload' }),
    ])

    expect(res.status).toBe(200)
    const json = (await res.json()) as { imageUploadWarning?: string }
    expect(json.imageUploadWarning).toMatch(/1.*2/)

    expect(uploadedStoragePaths).toHaveLength(1)
    expect(insertedAttachments).toHaveLength(1)
    expect(insertedAttachments[0]?.mime_type).toBe('image/png')
  })

  it('rejects oversized video without creating partial orphan uploads', async () => {
    const hugeVideo = new File([Buffer.alloc(16 * 1024 * 1024)], 'huge.mp4', {
      type: 'video/mp4',
    })

    const res = await postWebFormTicket([hugeVideo])

    expect(res.status).toBe(200)
    const json = (await res.json()) as { imageUploadWarning?: string }
    expect(json.imageUploadWarning).toBeDefined()
    expect(uploadedStoragePaths).toHaveLength(0)
    expect(insertedAttachments).toHaveLength(0)
  })
})
