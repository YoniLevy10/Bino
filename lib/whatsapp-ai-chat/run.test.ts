import { describe, expect, it } from 'vitest'
import {
  parseAiChatDecision,
  resolveAiChatTurn,
  stripModelUrls,
} from '@/lib/whatsapp-ai-chat/decision'
import { runClientWhatsAppAiChat } from '@/lib/whatsapp-ai-chat/run'

describe('whatsapp ai chat decision', () => {
  it('drops model URLs and parses a portal action', () => {
    expect(stripModelUrls('הנה הקישור https://evil.example/phish תודה')).toBe('הנה הקישור תודה')
    const decision = parseAiChatDecision(
      JSON.stringify({
        reply: 'link https://evil.example',
        language: 'en',
        action: 'portal_link',
        ticket_description: null,
        search_query: null,
      })
    )
    expect(decision?.reply).toBe('link')
    expect(decision?.action).toBe('portal_link')
  })

  it('attaches only the server resident-portal URL', () => {
    const turn = resolveAiChatTurn({
      decision: {
        reply: 'Sure https://evil.example',
        language: 'en',
        action: 'portal_link',
        ticket_description: null,
        search_query: null,
      },
      latestUserText: 'send me the resident link',
      project: { id: 'proj-1', name: 'Heleni' },
      portalUrl: 'https://bino.casa/resident/join/proj-1',
    })
    expect(turn.kind).toBe('reply')
    if (turn.kind !== 'reply') return
    expect(turn.text).toContain('https://bino.casa/resident/join/proj-1')
    expect(turn.text).not.toContain('evil.example')
  })

  it('does not invent a portal link when the building is unknown', () => {
    const turn = resolveAiChatTurn({
      decision: {
        reply: 'https://evil.example/residents',
        language: 'he',
        action: 'portal_link',
        ticket_description: null,
        search_query: null,
      },
      latestUserText: 'תן לינק',
      project: null,
      portalUrl: null,
    })
    expect(turn.kind).toBe('reply')
    if (turn.kind !== 'reply') return
    expect(turn.text).not.toMatch(/https?:\/\//)
    expect(turn.text).toContain('כתובת')
  })

  it('opens a ticket only with a real description and a known building', () => {
    const opened = resolveAiChatTurn({
      decision: {
        reply: 'Opening it',
        language: 'en',
        action: 'open_ticket',
        ticket_description: 'The lobby elevator is stuck',
        search_query: null,
      },
      latestUserText: 'The lobby elevator is stuck',
      project: { id: 'proj-1', name: 'Heleni' },
      portalUrl: 'https://bino.casa/resident/join/proj-1',
    })
    expect(opened).toMatchObject({
      kind: 'open_ticket',
      projectId: 'proj-1',
      description: 'The lobby elevator is stuck',
    })

    const greeting = resolveAiChatTurn({
      decision: {
        reply: 'Hi',
        language: 'en',
        action: 'open_ticket',
        ticket_description: 'hi',
        search_query: null,
      },
      latestUserText: 'hi',
      project: { id: 'proj-1', name: 'Heleni' },
      portalUrl: null,
    })
    expect(greeting.kind).toBe('reply')
  })
})

describe('runClientWhatsAppAiChat', () => {
  it('returns passthrough when the model is unavailable so the existing flow continues', async () => {
    const result = await runClientWhatsAppAiChat({
      supabaseAdmin: {} as never,
      clientId: 'c1',
      from: '972501111111',
      textBody: 'שלום',
      decideTurn: async () => null,
      findResident: async () => null,
      searchBuildings: async () => [],
      sendText: async () => {
        throw new Error('should not send')
      },
    })
    expect(result).toEqual({ kind: 'passthrough' })
  })

  it('sends the resident portal link for a known resident and does not open a ticket', async () => {
    const sent: string[] = []
    const result = await runClientWhatsAppAiChat({
      supabaseAdmin: {
        from(table: string) {
          if (table !== 'projects') throw new Error(table)
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'proj-9', name: 'הלני' },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        },
      } as never,
      clientId: 'c1',
      from: '972501111111',
      textBody: 'אפשר קישור לאזור דיירים?',
      decideTurn: async () => ({
        reply: 'בשמחה',
        language: 'he',
        action: 'portal_link',
        ticket_description: null,
        search_query: null,
      }),
      findResident: async () =>
        ({
          id: 'r1',
          project_id: 'proj-9',
          phone: '972501111111',
          client_id: 'c1',
          full_name: 'דנה לוי',
        }) as never,
      searchBuildings: async () => {
        throw new Error('known resident should not search')
      },
      sendText: async (text) => {
        sent.push(text)
      },
    })
    expect(result).toEqual({ kind: 'handled' })
    expect(sent[0]).toContain('/resident/join/proj-9')
    expect(sent[0]).not.toMatch(/evil\.example/)
  })
})
