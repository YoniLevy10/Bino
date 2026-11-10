import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSendResident = vi.fn()
const mockSendSms = vi.fn()

vi.mock('@/lib/whatsapp-resident-outbound', () => ({
  sendResidentTextOrTemplate: (...args: unknown[]) => mockSendResident(...args),
}))

vi.mock('@/lib/sms-send', () => ({
  sendResidentSMS: (...args: unknown[]) => mockSendSms(...args),
}))

vi.mock('@/lib/whatsapp-templates', () => ({
  resolveWhatsAppTemplateMessage: vi.fn(
    async (_admin: unknown, _clientId: unknown, _key: unknown, _fallback: unknown, vars: { project_name: string }) =>
      `שלום! התקלה שדיווחת בבניין ${vars.project_name} טופלה וסגורה.`
  ),
  resolveSmsTemplateMessage: vi.fn(async () => 'sms-body'),
}))

vi.mock('@/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import {
  isRecentCloseNotifyForBuilding,
  notifyReporterTicketClosed,
} from '@/lib/reporter-ticket-closed-notify'

const CLIENT_ID = 'client-1'
const TICKET_ID = 'ticket-1'
const BUILDING = 'אלרואי 5א'
const PHONE = '0501234567'

type QueryResult = { data: unknown; error: { message: string } | null }

function chain(terminal: (row?: unknown) => Promise<QueryResult>) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.select = vi.fn(self)
  builder.eq = vi.fn(self)
  builder.gte = vi.fn(self)
  builder.order = vi.fn(self)
  builder.is = vi.fn(self)
  builder.limit = vi.fn(() => terminal())
  builder.maybeSingle = vi.fn(() => terminal())
  builder.insert = vi.fn((row: unknown) => terminal(row))
  return builder
}

function makeAdmin(opts: {
  conv?: QueryResult
  messages?: QueryResult
  ticketLogError?: { message: string } | null
}) {
  const inserts: Array<{ table: string; row: unknown }> = []
  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'whatsapp_conversations') {
        return chain(() => Promise.resolve(opts.conv ?? { data: { id: 'conv-1' }, error: null }))
      }
      if (table === 'whatsapp_messages') {
        return chain(() => Promise.resolve(opts.messages ?? { data: [], error: null }))
      }
      if (table === 'clients') {
        return chain(() =>
          Promise.resolve({
            data: {
              whatsapp_phone_number_id: 'pn-1',
              whatsapp_access_token: 'token-1',
              sms_on_ticket_close: false,
            },
            error: null,
          })
        )
      }
      if (table === 'ticket_logs') {
        return chain((row) => {
          inserts.push({ table, row })
          return Promise.resolve({ data: null, error: opts.ticketLogError ?? null })
        })
      }
      if (table === 'system_logs') {
        return chain((row) => {
          inserts.push({ table, row })
          return Promise.resolve({ data: null, error: null })
        })
      }
      throw new Error(`unexpected table ${table}`)
    }),
  }
  return { admin, inserts }
}

function closeBody(building: string) {
  return `שלום! התקלה שדיווחת בבניין ${building} טופלה וסגורה.`
}

describe('isRecentCloseNotifyForBuilding', () => {
  it('matches a close text or template preview for the same building only', () => {
    expect(isRecentCloseNotifyForBuilding([closeBody(BUILDING)], BUILDING, 'ticket_closed')).toBe(true)
    expect(
      isRecentCloseNotifyForBuilding([`[template:ticket_closed] ${BUILDING}`], BUILDING, 'ticket_closed')
    ).toBe(true)
    expect(isRecentCloseNotifyForBuilding([closeBody('רחוב אחר')], BUILDING, 'ticket_closed')).toBe(false)
    expect(
      isRecentCloseNotifyForBuilding([`הטכנאי בדרך ל${BUILDING}`], BUILDING, 'ticket_closed')
    ).toBe(false)
  })
})

describe('notifyReporterTicketClosed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendResident.mockResolvedValue({ sent: true, mode: 'text' })
    mockSendSms.mockResolvedValue(false)
  })

  it('sends once with a single building template param when nothing recent exists', async () => {
    const { admin, inserts } = makeAdmin({ messages: { data: [], error: null } })

    const result = await notifyReporterTicketClosed(admin as never, CLIENT_ID, {
      reporterPhone: PHONE,
      projectName: BUILDING,
      ticketId: TICKET_ID,
    })

    expect(result.whatsappSent).toBe(true)
    expect(result.skipped).toBeUndefined()
    expect(mockSendResident).toHaveBeenCalledTimes(1)
    const sendOpts = mockSendResident.mock.calls[0][1] as {
      templateParams: string[]
      templateName: string
      ticketId: string
    }
    expect(sendOpts.templateName).toBe('ticket_closed')
    expect(sendOpts.templateParams).toEqual([BUILDING])
    expect(sendOpts.ticketId).toBe(TICKET_ID)
    expect(inserts.map((row) => row.table)).toEqual(['ticket_logs'])
    expect(mockSendSms).not.toHaveBeenCalled()
  })

  it('skips a second close for the same phone and building without throwing', async () => {
    const { admin, inserts } = makeAdmin({
      messages: { data: [{ body: closeBody(BUILDING) }], error: null },
    })

    const result = await notifyReporterTicketClosed(admin as never, CLIENT_ID, {
      reporterPhone: PHONE,
      projectName: BUILDING,
      ticketId: TICKET_ID,
    })

    expect(result).toMatchObject({ whatsappSent: false, smsSent: false, skipped: true })
    expect(mockSendResident).not.toHaveBeenCalled()
    expect(mockSendSms).not.toHaveBeenCalled()
    expect(inserts).toEqual([])
  })

  it('still sends when the recent close is for a different building', async () => {
    const { admin } = makeAdmin({
      messages: { data: [{ body: closeBody('רחוב אחר') }], error: null },
    })

    const result = await notifyReporterTicketClosed(admin as never, CLIENT_ID, {
      reporterPhone: PHONE,
      projectName: BUILDING,
      ticketId: TICKET_ID,
    })

    expect(result.whatsappSent).toBe(true)
    expect(mockSendResident).toHaveBeenCalledTimes(1)
  })

  it('sends when the recent-message lookup fails', async () => {
    const { admin } = makeAdmin({
      messages: { data: null, error: { message: 'timeout' } },
    })

    const result = await notifyReporterTicketClosed(admin as never, CLIENT_ID, {
      reporterPhone: PHONE,
      projectName: BUILDING,
      ticketId: TICKET_ID,
    })

    expect(result.whatsappSent).toBe(true)
    expect(result.skipped).toBeUndefined()
    expect(mockSendResident).toHaveBeenCalledTimes(1)
  })

  it('reports the send as successful when the timeline insert fails', async () => {
    const { admin, inserts } = makeAdmin({
      messages: { data: [], error: null },
      ticketLogError: { message: 'insert failed' },
    })

    const result = await notifyReporterTicketClosed(admin as never, CLIENT_ID, {
      reporterPhone: PHONE,
      projectName: BUILDING,
      ticketId: TICKET_ID,
    })

    expect(result.whatsappSent).toBe(true)
    expect(result.whatsappError).toBeUndefined()
    expect(inserts).toHaveLength(1)
    expect(inserts[0]?.table).toBe('ticket_logs')
  })

  it('writes system_logs when WhatsApp and SMS both fail', async () => {
    mockSendResident.mockResolvedValue({ sent: false, errorMessage: 'meta down', metaErrorCode: 131026 })
    const { admin, inserts } = makeAdmin({ messages: { data: [], error: null } })

    const result = await notifyReporterTicketClosed(admin as never, CLIENT_ID, {
      reporterPhone: PHONE,
      projectName: BUILDING,
      ticketId: TICKET_ID,
    })

    expect(result.whatsappSent).toBe(false)
    expect(result.smsSent).toBe(false)
    const failure = inserts.find((row) => row.table === 'system_logs')
    expect(failure).toBeTruthy()
    expect(failure?.row).toMatchObject({
      level: 'error',
      source: 'ticket_closed_notify',
      payload: { clientId: CLIENT_ID, ticketId: TICKET_ID },
    })
    expect(inserts.some((row) => row.table === 'ticket_logs')).toBe(false)
  })
})
