import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'
import type { TenantOpsSnapshot } from '@/lib/ops-context/tenant-snapshot'
import type { OpsBriefing } from '@/lib/ops-context/synthesize-briefing'
import { synthesizeOpsBriefing } from '@/lib/ops-context/synthesize-briefing'

vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

vi.mock('@/lib/whatsapp/whatsapp-ai-gateway', () => ({
  hasAiGatewayAuth: vi.fn(() => true),
  resolveWhatsAppAiModel: vi.fn(() => ({
    model: 'anthropic/claude-haiku-4.5',
    route: 'gateway' as const,
    modelId: 'anthropic/claude-haiku-4.5',
  })),
}))

import { generateText } from 'ai'
import { hasAiGatewayAuth, resolveWhatsAppAiModel } from '@/lib/whatsapp/whatsapp-ai-gateway'
import {
  buildOpsBriefingAiInput,
  generateLlmOpsBriefing,
  isOpsBriefingAiEnabled,
  mergeLlmIntoOpsBriefing,
  parseLlmOpsBriefingJson,
  resolveOpsBriefing,
  sanitizeOpsBriefingHref,
} from '@/lib/ops-context/llm-ops-briefing'

function emptySnapshot(over: Partial<TenantOpsSnapshot> = {}): TenantOpsSnapshot {
  return {
    clientId: 'c1',
    generatedAt: new Date().toISOString(),
    tickets: { open: 0, unassigned: 0, recurringOpen: 0, agingUnassigned: 0 },
    maintenance: { overdue: 0 },
    collections: {
      enabled: false,
      drafts: 0,
      sendFailed: 0,
      sentUnpaid: 0,
      growBuildingsTotal: 0,
      growBuildingsReady: 0,
      growBuildingsMissing: 0,
    },
    hotProjects: [],
    ...over,
  }
}

function busySnapshot(): TenantOpsSnapshot {
  return emptySnapshot({
    tickets: { open: 8, unassigned: 3, recurringOpen: 2, agingUnassigned: 2 },
    maintenance: { overdue: 1 },
    hotProjects: [{ id: 'p1', name: 'הרצל 12', openTickets: 5, recurringOpen: 2 }],
  })
}

function heuristicFor(snapshot: TenantOpsSnapshot): OpsBriefing {
  return synthesizeOpsBriefing(snapshot)
}

const envKeys = [
  'OPS_BRIEFING_AI_ENABLED',
  'WHATSAPP_AI_ENABLED',
  'AI_GATEWAY_API_KEY',
  'VERCEL_OIDC_TOKEN',
] as const

describe('parseLlmOpsBriefingJson', () => {
  it('parses valid Hebrew JSON payload', () => {
    const parsed = parseLlmOpsBriefingJson(
      JSON.stringify({
        headline: 'דחוף: שיוך תקלות מבוגרות',
        summary: 'יש תקלות בלי שיוך מעל 48 שעות. התחילו משיוך כדי לקצר זמן טיפול.',
        priorities: [
          {
            title: 'שייכו תקלות ישנות',
            whyNow: 'זמן עד שיוך נפגע',
            href: '/tickets?status=open',
          },
        ],
      })
    )
    expect(parsed).not.toBeNull()
    expect(parsed!.headline).toMatch(/שיוך/)
    expect(parsed!.priorities).toHaveLength(1)
    expect(parsed!.priorities[0].title).toBe('שייכו תקלות ישנות')
    expect(parsed!.priorities[0].whyNow).toBe('זמן עד שיוך נפגע')
  })

  it('accepts fenced markdown and label alias', () => {
    const parsed = parseLlmOpsBriefingJson(
      '```json\n{"headline":"כותרת טובה","summary":"סיכום קצר ומספיק.","priorities":[{"label":"פעולה","why_now":"עכשיו"}]}\n```'
    )
    expect(parsed?.priorities[0].title).toBe('פעולה')
    expect(parsed?.priorities[0].whyNow).toBe('עכשיו')
  })

  it('returns null on junk / incomplete JSON', () => {
    expect(parseLlmOpsBriefingJson('not json')).toBeNull()
    expect(parseLlmOpsBriefingJson('{"headline":"x"}')).toBeNull()
    expect(parseLlmOpsBriefingJson('{"headline":"","summary":"ok enough"}')).toBeNull()
    expect(parseLlmOpsBriefingJson('{"headline":"hi","summary":"ab","priorities":"nope"}')).toBeNull()
  })

  it('caps priorities at 5 and skips empty titles', () => {
    const priorities = Array.from({ length: 8 }, (_, i) => ({
      title: i === 2 ? '' : `פעולה ${i}`,
      whyNow: 'סיבה',
    }))
    const parsed = parseLlmOpsBriefingJson(
      JSON.stringify({
        headline: 'כותרת',
        summary: 'סיכום ארוך מספיק',
        priorities,
      })
    )
    expect(parsed!.priorities.length).toBeLessThanOrEqual(5)
    expect(parsed!.priorities.every((p) => p.title.length >= 2)).toBe(true)
  })
})

describe('sanitizeOpsBriefingHref', () => {
  it('allows relative paths and rejects absolute/protocol-relative', () => {
    expect(sanitizeOpsBriefingHref('/tickets', '/dashboard')).toBe('/tickets')
    expect(sanitizeOpsBriefingHref('//evil.com', '/dashboard')).toBe('/dashboard')
    expect(sanitizeOpsBriefingHref('https://evil.com', '/dashboard')).toBe('/dashboard')
    expect(sanitizeOpsBriefingHref(null, '/dashboard')).toBe('/dashboard')
  })
})

describe('buildOpsBriefingAiInput', () => {
  it('bounds recommendations and omits ticket dumps', () => {
    const recs = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      client_id: 'c1',
      recommendation_type: 'sla_unassigned',
      entity_type: 'ticket',
      entity_id: `t${i}`,
      dedupe_key: `d${i}`,
      urgency: 'high',
      reason: `סיבה ${i} ${'x'.repeat(200)}`,
      facts: { ticketIds: ['a', 'b', 'c'] },
      primary_action: null,
      primary_action_href: '/tickets',
      actions: [],
      status: 'active',
      detected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      snoozed_until: null,
      acted_by: null,
      acted_at: null,
      resolved_by: null,
      resolved_at: null,
      resolution_source: null,
      last_validated_at: null,
    })) as ManagementRecommendationRow[]

    const input = buildOpsBriefingAiInput(busySnapshot(), recs)
    expect(input.topRecommendations).toHaveLength(5)
    expect(input.topRecommendations[0].reason.length).toBeLessThanOrEqual(160)
    expect(JSON.stringify(input)).not.toMatch(/ticketIds/)
    expect(input.tickets.agingUnassigned).toBe(2)
  })
})

describe('mergeLlmIntoOpsBriefing', () => {
  it('maps title/whyNow onto OpsBriefing and sets source=llm', () => {
    const heuristic = heuristicFor(busySnapshot())
    const merged = mergeLlmIntoOpsBriefing(
      {
        headline: 'כותרת מודל',
        summary: 'סיכום מודל קצר.',
        priorities: [
          {
            title: 'שייכו עכשיו',
            whyNow: 'SLA בסיכון',
            href: '/tickets?status=open',
          },
        ],
      },
      heuristic
    )
    expect(merged.source).toBe('llm')
    expect(merged.headline).toBe('כותרת מודל')
    expect(merged.priorities[0].label).toBe('שייכו עכשיו')
    expect(merged.priorities[0].whyNow).toBe('SLA בסיכון')
    expect(merged.quiet).toBe(false)
  })

  it('keeps heuristic priorities when LLM returns empty list', () => {
    const heuristic = heuristicFor(busySnapshot())
    expect(heuristic.priorities.length).toBeGreaterThan(0)
    const merged = mergeLlmIntoOpsBriefing(
      { headline: 'שקט יחסית', summary: 'אין פעולות דחופות כרגע.', priorities: [] },
      heuristic
    )
    expect(merged.priorities).toEqual(heuristic.priorities)
  })
})

describe('isOpsBriefingAiEnabled / resolveOpsBriefing fallback', () => {
  const saved: Partial<Record<(typeof envKeys)[number], string | undefined>> = {}

  beforeEach(() => {
    for (const k of envKeys) saved[k] = process.env[k]
    delete process.env.OPS_BRIEFING_AI_ENABLED
    delete process.env.WHATSAPP_AI_ENABLED
    vi.mocked(hasAiGatewayAuth).mockReturnValue(true)
    vi.mocked(resolveWhatsAppAiModel).mockReturnValue({
      model: 'anthropic/claude-haiku-4.5',
      route: 'gateway',
      modelId: 'anthropic/claude-haiku-4.5',
    })
    vi.mocked(generateText).mockReset()
  })

  afterEach(() => {
    for (const k of envKeys) {
      const v = saved[k]
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('follows WHATSAPP_AI_ENABLED when dedicated flag unset', () => {
    process.env.WHATSAPP_AI_ENABLED = 'true'
    expect(isOpsBriefingAiEnabled()).toBe(true)
    process.env.WHATSAPP_AI_ENABLED = 'false'
    expect(isOpsBriefingAiEnabled()).toBe(false)
  })

  it('OPS_BRIEFING_AI_ENABLED can force off while WhatsApp AI is on', () => {
    process.env.WHATSAPP_AI_ENABLED = 'true'
    process.env.OPS_BRIEFING_AI_ENABLED = 'false'
    expect(isOpsBriefingAiEnabled()).toBe(false)
  })

  it('OPS_BRIEFING_AI_ENABLED can force on without WhatsApp flag', () => {
    delete process.env.WHATSAPP_AI_ENABLED
    process.env.OPS_BRIEFING_AI_ENABLED = 'true'
    expect(isOpsBriefingAiEnabled()).toBe(true)
  })

  it('returns null from generate when AI returns junk (no real gateway)', async () => {
    process.env.OPS_BRIEFING_AI_ENABLED = 'true'
    vi.mocked(generateText).mockResolvedValue({ text: 'lol not json' } as never)
    const snapshot = busySnapshot()
    const heuristic = heuristicFor(snapshot)
    const result = await generateLlmOpsBriefing(snapshot, [], heuristic)
    expect(result).toBeNull()
  })

  it('resolveOpsBriefing falls back to identical heuristic when AI fails', async () => {
    process.env.OPS_BRIEFING_AI_ENABLED = 'true'
    vi.mocked(generateText).mockRejectedValue(new Error('gateway down'))
    const snapshot = busySnapshot()
    const expected = synthesizeOpsBriefing(snapshot)
    const got = await resolveOpsBriefing(snapshot, [])
    expect(got).toEqual(expected)
    expect(got.source).toBe('heuristic')
  })

  it('resolveOpsBriefing skips generateText when AI disabled', async () => {
    process.env.OPS_BRIEFING_AI_ENABLED = 'false'
    const got = await resolveOpsBriefing(busySnapshot(), [])
    expect(generateText).not.toHaveBeenCalled()
    expect(got.source).toBe('heuristic')
  })

  it('resolveOpsBriefing uses LLM merge when generate returns valid JSON', async () => {
    process.env.OPS_BRIEFING_AI_ENABLED = 'true'
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        headline: 'מסקנת מודל',
        summary: 'יש לפעול על שיוך עכשיו.',
        priorities: [{ title: 'שייכו', whyNow: 'חריגת SLA', href: '/tickets' }],
      }),
    } as never)
    const got = await resolveOpsBriefing(busySnapshot(), [])
    expect(got.source).toBe('llm')
    expect(got.headline).toBe('מסקנת מודל')
    expect(got.priorities[0].whyNow).toBe('חריגת SLA')
  })
})
