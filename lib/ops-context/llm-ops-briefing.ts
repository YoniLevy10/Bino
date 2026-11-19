/**
 * LLM ops briefing for the manager RecommendationsBell panel.
 *
 * Grounded only in the bound TenantOpsSnapshot + top recommendation titles/reasons
 * (no full ticket dumps). Uses the existing Vercel AI Gateway helpers from WhatsApp AI
 * — no new paid vendors.
 *
 * Feature flag:
 *   - OPS_BRIEFING_AI_ENABLED=true|false → explicit on/off
 *   - when unset, follows WHATSAPP_AI_ENABLED (same as WhatsApp rewrite AI)
 * Also requires AI Gateway auth (AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN).
 *
 * On disable / timeout / junk JSON → caller keeps synthesizeOpsBriefing (never blank).
 */

import { generateText } from 'ai'
import {
  hasAiGatewayAuth,
  resolveWhatsAppAiModel,
} from '@/lib/whatsapp/whatsapp-ai-gateway'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'
import type { Urgency } from '@/lib/recommendations/types'
import {
  synthesizeOpsBriefing,
  type OpsBriefing,
  type OpsBriefingPriority,
} from '@/lib/ops-context/synthesize-briefing'
import type { TenantOpsSnapshot } from '@/lib/ops-context/tenant-snapshot'

const TOP_RECS = 5
const MAX_PRIORITIES = 5
const LLM_TIMEOUT_MS = 10_000
const MAX_OUTPUT_TOKENS = 450

const SYSTEM_PROMPT = `אתה עוזר תפעולי של Bino (Building Intelligence & Operations) למנהלי בניינים בישראל.
תפקידך: תמונת מצב תפעולית קצרה שמסייעת להחליט מה לעשות עכשיו — זמן עד שיוך, תקלות חוזרות, תחזוקה, גבייה.
חוקים:
- עברית בלבד, RTL-friendly, בלי אמוג'י
- אל תמציא מספרים או בניינים שלא מופיעים בקלט
- אל תציע צ'אט כללי — רק מסקנות פעולה
- החזר JSON בלבד לפי הסכמה, בלי markdown`

export type LlmOpsBriefingPriority = {
  title: string
  whyNow: string
  href?: string
}

export type LlmOpsBriefingPayload = {
  headline: string
  summary: string
  priorities: LlmOpsBriefingPriority[]
}

/** Compact input for the model — aggregated counts + top N titles only. */
export type OpsBriefingAiInput = {
  tickets: TenantOpsSnapshot['tickets']
  maintenance: TenantOpsSnapshot['maintenance']
  collections: {
    enabled: boolean
    drafts: number
    sendFailed: number
    sentUnpaid: number
    growBuildingsMissing: number
  }
  hotProjects: Array<{
    name: string
    openTickets: number
    recurringOpen: number
  }>
  topRecommendations: Array<{
    urgency: string
    reason: string
    href: string | null
    type: string
  }>
}

/**
 * OPS_BRIEFING_AI_ENABLED overrides when set; otherwise follows WHATSAPP_AI_ENABLED.
 * Always requires AI Gateway auth.
 */
export function isOpsBriefingAiEnabled(): boolean {
  if (!hasAiGatewayAuth()) return false
  const dedicated = process.env.OPS_BRIEFING_AI_ENABLED?.trim().toLowerCase()
  if (dedicated === 'false' || dedicated === '0') return false
  if (dedicated === 'true' || dedicated === '1') return true
  return process.env.WHATSAPP_AI_ENABLED === 'true'
}

export function buildOpsBriefingAiInput(
  snapshot: TenantOpsSnapshot,
  recommendations: ManagementRecommendationRow[],
  topN = TOP_RECS
): OpsBriefingAiInput {
  return {
    tickets: { ...snapshot.tickets },
    maintenance: { ...snapshot.maintenance },
    collections: {
      enabled: snapshot.collections.enabled,
      drafts: snapshot.collections.drafts,
      sendFailed: snapshot.collections.sendFailed,
      sentUnpaid: snapshot.collections.sentUnpaid,
      growBuildingsMissing: snapshot.collections.growBuildingsMissing,
    },
    hotProjects: snapshot.hotProjects.slice(0, 5).map((p) => ({
      name: p.name.slice(0, 80),
      openTickets: p.openTickets,
      recurringOpen: p.recurringOpen,
    })),
    topRecommendations: recommendations.slice(0, topN).map((r) => ({
      urgency: String(r.urgency),
      reason: String(r.reason || '').slice(0, 160),
      href: r.primary_action_href ? String(r.primary_action_href).slice(0, 120) : null,
      type: String(r.recommendation_type || '').slice(0, 64),
    })),
  }
}

export function buildOpsBriefingUserPrompt(input: OpsBriefingAiInput): string {
  return `קלט תפעולי מצטבר (בלי פירוט תקלות מלא):
${JSON.stringify(input)}

החזר JSON בדיוק במבנה:
{
  "headline": "כותרת קצרה בעברית (עד ~60 תווים)",
  "summary": "עד 3 משפטים קצרים בעברית — מה חשוב עכשיו ולמה",
  "priorities": [
    { "title": "פעולה קצרה", "whyNow": "למה עכשיו (משפט אחד)", "href": "/path?optional=1" }
  ]
}
כללים ל-priorities: 0 עד ${MAX_PRIORITIES} פריטים; href רק נתיב יחסי שמתחיל ב-/ מהקלט או מסכים ידועים (/tickets, /tasks, /collections, /settings). אם המערכת שקטה — priorities ריק ו-headline/summary רגועים.`
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  return (fenced?.[1] ?? trimmed).trim()
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Relative app paths only — reject protocol-relative / absolute URLs. */
export function sanitizeOpsBriefingHref(
  href: unknown,
  fallback: string
): string {
  if (typeof href !== 'string') return fallback
  const t = href.trim()
  if (!t.startsWith('/') || t.startsWith('//') || t.includes('://')) return fallback
  return t.slice(0, 200)
}

/**
 * Parse model JSON into a raw LLM payload. Returns null on junk / incomplete shape.
 */
export function parseLlmOpsBriefingJson(raw: string): LlmOpsBriefingPayload | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>
    const headline = clip(parsed.headline, 120)
    const summary = clip(parsed.summary, 500)
    if (headline.length < 2 || summary.length < 4) return null

    const rawPriorities = Array.isArray(parsed.priorities) ? parsed.priorities : []
    const priorities: LlmOpsBriefingPriority[] = []
    for (const item of rawPriorities.slice(0, MAX_PRIORITIES)) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const title = clip(row.title ?? row.label, 120)
      const whyNow = clip(row.whyNow ?? row.why_now, 200)
      if (title.length < 2) continue
      const hrefRaw = row.href
      priorities.push({
        title,
        whyNow: whyNow || 'דורש תשומת לב עכשיו',
        ...(typeof hrefRaw === 'string' && hrefRaw.trim()
          ? { href: hrefRaw.trim() }
          : {}),
      })
    }

    return { headline, summary, priorities }
  } catch {
    return null
  }
}

function inferDomain(href: string, typeHint: string): OpsBriefingPriority['domain'] {
  const h = href.toLowerCase()
  const t = typeHint.toLowerCase()
  if (h.includes('collection') || t.includes('collection')) return 'collections'
  if (h.includes('grow') || h.includes('settings')) return 'grow'
  if (h.includes('task') || t.includes('maintenance')) return 'maintenance'
  if (h.includes('project') || t.includes('building') || t.includes('topic')) return 'building'
  return 'tickets'
}

function urgencyFromString(u: unknown): Urgency {
  if (u === 'critical' || u === 'high' || u === 'medium' || u === 'low') return u
  return 'medium'
}

/**
 * Map LLM payload onto OpsBriefing, inheriting urgency/domain from heuristic matches when possible.
 */
export function mergeLlmIntoOpsBriefing(
  llm: LlmOpsBriefingPayload,
  heuristic: OpsBriefing
): OpsBriefing {
  const byHref = new Map(heuristic.priorities.map((p) => [p.href, p]))
  const domains = new Set<OpsBriefingPriority['domain']>(heuristic.domains)

  let priorities: OpsBriefingPriority[]
  if (llm.priorities.length === 0) {
    // Quiet / empty LLM list — keep heuristic priorities (may also be empty).
    priorities = heuristic.priorities.map((p) => ({ ...p }))
  } else {
    priorities = llm.priorities.map((p, i) => {
      const fallbackHref =
        heuristic.priorities[i]?.href ||
        heuristic.priorities[0]?.href ||
        '/dashboard'
      const href = sanitizeOpsBriefingHref(p.href, fallbackHref)
      const matched = byHref.get(href) || heuristic.priorities[i]
      const domain = matched?.domain ?? inferDomain(href, '')
      domains.add(domain)
      return {
        label: p.title,
        whyNow: p.whyNow,
        href,
        urgency: matched?.urgency ?? urgencyFromString('medium'),
        domain,
      }
    })
  }

  const quiet = priorities.length === 0

  return {
    headline: llm.headline,
    summary: llm.summary,
    priorities,
    domains: [...domains],
    quiet,
    source: 'llm',
  }
}

/**
 * Call AI Gateway for a Hebrew ops briefing. Returns null on any failure
 * so callers can keep the heuristic briefing.
 */
export async function generateLlmOpsBriefing(
  snapshot: TenantOpsSnapshot,
  recommendations: ManagementRecommendationRow[],
  heuristic: OpsBriefing
): Promise<OpsBriefing | null> {
  if (!isOpsBriefingAiEnabled()) return null

  // Reuse WhatsApp AI Gateway model resolution — no separate vendor/SDK.
  const resolved = resolveWhatsAppAiModel('rewrite')
  if (!resolved) return null

  const input = buildOpsBriefingAiInput(snapshot, recommendations)
  try {
    const { text } = await generateText({
      model: resolved.model,
      system: SYSTEM_PROMPT,
      prompt: buildOpsBriefingUserPrompt(input),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    })
    if (!text?.trim()) return null
    const parsed = parseLlmOpsBriefingJson(text)
    if (!parsed) return null
    return mergeLlmIntoOpsBriefing(parsed, heuristic)
  } catch (e) {
    console.warn(
      '[ops-briefing-ai] generate failed:',
      e instanceof Error ? e.message : String(e)
    )
    return null
  }
}

/**
 * Prefer LLM briefing when enabled; always fall back to heuristic (never blank).
 */
export async function resolveOpsBriefing(
  snapshot: TenantOpsSnapshot,
  recommendations: ManagementRecommendationRow[] = []
): Promise<OpsBriefing> {
  const heuristic = synthesizeOpsBriefing(snapshot, recommendations)
  if (!isOpsBriefingAiEnabled()) return heuristic
  const llm = await generateLlmOpsBriefing(snapshot, recommendations, heuristic)
  return llm ?? heuristic
}
