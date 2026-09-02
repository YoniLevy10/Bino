/**
 * Marketing Director — orchestrates objective → structured Campaign Plan.
 * Uses LLM when available; falls back to deterministic Brand Brain plan (zero cost).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getLLMProvider } from '@/lib/mbrain/providers/llm'
import { campaignPlanSchema, type CampaignPlan } from '@/lib/mbrain/strategy-schema'
import { mbrainLog } from '@/lib/mbrain/logging'
import { evaluateBudgetAgainstGuardrails, type Guardrails } from '@/lib/mbrain/guardrails'

export type BrandContext = {
  brand: {
    id: string
    name: string
    website: string | null
    market: string
  }
  profile: {
    product_description: string | null
    target_customers: string | null
    customer_pains: unknown
    value_propositions: unknown
    differentiators: unknown
    icps: unknown
    brand_voice: unknown
    prohibited_claims: unknown
  } | null
  hypotheses: Array<{
    id: string
    title: string
    statement: string
    creative_angle: string
    target_pain: string | null
  }>
}

export type ObjectiveRow = {
  id: string
  title: string
  goal_type: string
  target_count: number | null
  max_cpl: number | null
  total_budget: number | null
  daily_budget: number | null
  market: string
  audience: string | null
  product_name: string | null
  currency: string
  raw_brief: string | null
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** Deterministic plan from Brand Brain — no LLM required. */
export function buildDeterministicCampaignPlan(
  objective: ObjectiveRow,
  ctx: BrandContext
): CampaignPlan {
  const pains = asStringArray(ctx.profile?.customer_pains)
  const offers = asStringArray(ctx.profile?.value_propositions)
  const icps = Array.isArray(ctx.profile?.icps) ? ctx.profile!.icps : []
  const firstIcp = (icps[0] ?? {}) as { name?: string; notes?: string; geography?: string }

  const angles = ctx.hypotheses.slice(0, 5).map((h) => ({
    hypothesisId: h.id,
    angle: h.creative_angle,
    hook:
      h.title === 'WhatsApp is not a CMMS'
        ? '120 WhatsApp messages are not a maintenance management system.'
        : h.creative_angle,
    whyItMightWork: h.statement,
  }))

  return campaignPlanSchema.parse({
    objective: objective.title,
    idealCustomerProfile: {
      name: firstIcp.name ?? objective.audience ?? 'מנהל בחברת ניהול נכסים',
      description:
        firstIcp.notes ??
        ctx.profile?.target_customers ??
        'Decision makers at Israeli property management companies (hypothesis).',
      geography: firstIcp.geography ?? objective.market,
      decisionCriteria: ['חיסכון בזמן תפעולי', 'ראות SLA', 'אימוץ ע״י עובדים ודיירים'],
    },
    painPoints: pains.length
      ? pains
      : ['בקשות אחזקה מפוזרות בוואטסאפ', 'חוסר ראות תפעולית'],
    offers: offers.length ? offers : ['הדגמה מותאמת לחברת ניהול', 'פיילוט על בניין אחד'],
    positioning:
      asStringArray(ctx.profile?.differentiators).join(' · ') ||
      `${ctx.brand.name} מרכזת תפעול אחזקה במקום וואטסאפ, שיחות וגיליונות.`,
    funnel: {
      stages: ['מודעה', 'דף נחיתה / דמו', 'ליד מותאם', 'הדגמה', 'לקוח'],
      primaryConversion: 'qualified_demo_lead',
      landingPageRole: 'הסבר כאב → הצעת ערך → CTA להדגמה',
    },
    campaignObjective: 'OUTCOME_LEADS',
    audienceHypotheses: [
      {
        name: 'מנהלי חברות ניהול — ישראל',
        targetingIdea: 'עניין בניהול נכסים / נדל״ן מניב + גיל 28–55 + ישראל',
        rationale: 'ICP ראשוני — לבדיקה, לא עובדה מוכחת',
      },
      {
        name: 'Lookalike אחרי לידים איכותיים',
        targetingIdea: 'Lookalike מלידים שהגיעו ל-demo_booked',
        rationale: 'רק אחרי שיש מספיק לידים מאומתים',
      },
    ],
    creativeAngles: angles.length
      ? angles
      : [
          {
            angle: 'WhatsApp is not a maintenance management system.',
            hook: '120 WhatsApp messages are not a maintenance management system.',
            whyItMightWork: 'Pain is vivid and specific to the ICP.',
          },
        ],
    copyAngles: angles.map((a) => ({
      angle: a.angle,
      primaryTextIdea: a.hook,
      headlineIdea: a.angle,
    })),
    budget: {
      currency: objective.currency,
      daily: objective.daily_budget ?? undefined,
      monthly: objective.total_budget ?? undefined,
      allocationNotes:
        '70% על זוויות מובילות אחרי מינימום דאטה · 30% על בדיקות זווית חדשות',
    },
    testingPlan: {
      variables: ['creative_angle', 'hook', 'primary_text', 'audience'],
      minDataBeforeJudge: 'לפחות הוצאה מינימלית + לידים/קליקים לפי guardrails',
      sequence: ['2–3 זוויות במקביל', 'השהיית מפסידים', 'הגדלת תקציב למנצחים באישור'],
    },
    successMetrics: {
      primary: 'CPL לליד מותאם / הדגמה',
      secondary: ['CTR', 'CPC', 'Landing page conversion', 'Qualified rate'],
      targetCpl: objective.max_cpl,
      targetLeads: objective.target_count,
    },
    stopConditions: [
      'חריגה ממגבלת הוצאה יומית/חודשית',
      'CPL מעל יעד × מכפיל מוגדר אחרי מינימום המרות',
      'הוצאה מעל סף בלי לידים',
    ],
    optimizationRules: [
      'לא לשפוט מודעה לפני סף דאטה מינימלי',
      'CTR חזק + המרה חלשה → לבדוק דף נחיתה/הצעה',
      'CTR חלש → לבדוק קריאייטיב/הוק',
      'Frequency עולה + CTR יורד → חשד לעייפות קריאייטיב',
    ],
    risks: [
      'לידים זולים שאינם מותאמים',
      'קהל רחב מדי מחוץ לחברות ניהול',
      'תקציב יומי נמוך מדי ללמידה',
    ],
  })
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('LLM did not return JSON')
  }
}

export async function generateCampaignPlan(opts: {
  objective: ObjectiveRow
  ctx: BrandContext
  guardrails: Guardrails
}): Promise<{
  plan: CampaignPlan
  provider: string
  model: string
  costUsd: number
  source: 'llm' | 'deterministic'
}> {
  const proposedDaily = opts.objective.daily_budget
  const proposedMonthly = opts.objective.total_budget
  const violations = evaluateBudgetAgainstGuardrails({
    guardrails: opts.guardrails,
    proposedDailyBudget: proposedDaily,
    projectedMonthlySpend: proposedMonthly,
    proposedLifetimeBudget: proposedMonthly,
  })
  if (violations.length) {
    const err = new Error(violations.map((v) => v.messageHe).join('; '))
    ;(err as Error & { code: string }).code = 'GUARDRAIL_VIOLATION'
    throw err
  }

  const deterministic = buildDeterministicCampaignPlan(opts.objective, opts.ctx)

  // Prefer LLM enrichment when provider is reachable; always validate with Zod.
  try {
    if (process.env.MBRAIN_LLM_STUB === '1' || (process.env.AI_PROVIDER ?? 'local') === 'stub') {
      return {
        plan: deterministic,
        provider: 'stub',
        model: 'deterministic',
        costUsd: 0,
        source: 'deterministic',
      }
    }

    const llm = getLLMProvider()
    const result = await llm.complete({
      messages: [
        {
          role: 'system',
          content:
            'You are a Marketing Director. Return ONLY valid JSON matching the campaign plan schema. Hebrew UI context; keep structured fields clear. Do not invent performance metrics.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruction: 'Refine this campaign plan using brand context. Keep schema keys exactly.',
            schemaHint: Object.keys(deterministic),
            objective: opts.objective,
            brand: opts.ctx.brand,
            profile: opts.ctx.profile,
            hypotheses: opts.ctx.hypotheses,
            basePlan: deterministic,
          }),
        },
      ],
      temperature: 0.3,
      responseFormatJson: true,
      maxTokens: 4000,
    })

    const parsed = campaignPlanSchema.safeParse(extractJsonObject(result.content))
    if (!parsed.success) {
      mbrainLog('warn', 'strategy_llm_invalid_json', { issues: parsed.error.issues.slice(0, 5) })
      return {
        plan: deterministic,
        provider: result.provider,
        model: result.model,
        costUsd: result.estimatedCostUsd,
        source: 'deterministic',
      }
    }
    return {
      plan: parsed.data,
      provider: result.provider,
      model: result.model,
      costUsd: result.estimatedCostUsd,
      source: 'llm',
    }
  } catch (e) {
    mbrainLog('warn', 'strategy_llm_fallback', {
      message: e instanceof Error ? e.message : String(e),
    })
    return {
      plan: deterministic,
      provider: 'deterministic',
      model: 'brand-brain',
      costUsd: 0,
      source: 'deterministic',
    }
  }
}

export async function loadBrandContext(
  admin: SupabaseClient,
  organizationId: string,
  brandId: string
): Promise<BrandContext | null> {
  const { data: brand } = await admin
    .from('mbrain_brands')
    .select('id, name, website, market')
    .eq('id', brandId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!brand) return null

  const [{ data: profile }, { data: hypotheses }] = await Promise.all([
    admin.from('mbrain_brand_profiles').select('*').eq('brand_id', brandId).maybeSingle(),
    admin
      .from('mbrain_marketing_hypotheses')
      .select('id, title, statement, creative_angle, target_pain')
      .eq('brand_id', brandId)
      .order('sort_order'),
  ])

  return {
    brand,
    profile,
    hypotheses: hypotheses ?? [],
  }
}
