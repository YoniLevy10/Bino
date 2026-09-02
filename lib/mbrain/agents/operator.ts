/**
 * AI Operator — Hebrew marketing director with typed tools.
 * SPEND actions go through Approval Engine; never arbitrary Meta HTTP.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getLLMProvider } from '@/lib/mbrain/providers/llm'
import { generateCampaignPlan, loadBrandContext } from '@/lib/mbrain/agents/marketing-director'
import { generateCopyForHypothesis } from '@/lib/mbrain/agents/copywriter'
import { getImageGenerationProvider } from '@/lib/mbrain/providers/image'
import { createCampaignDraftFromStrategy } from '@/lib/mbrain/campaign-builder'
import { requestApproval } from '@/lib/mbrain/approval-engine'
import { evaluateOptimizationRules } from '@/lib/mbrain/optimization-rules'
import { rollupKpis } from '@/lib/mbrain/meta/insights'
import type { Guardrails } from '@/lib/mbrain/guardrails'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'
import { mbrainLog } from '@/lib/mbrain/logging'

export type OperatorActionCard = {
  type:
    | 'analyzing'
    | 'generated_creatives'
    | 'strategy_created'
    | 'campaign_draft'
    | 'approval_required'
    | 'performance'
    | 'info'
    | 'error'
  titleHe: string
  bodyHe: string
  meta?: Record<string, unknown>
}

export type OperatorResult = {
  replyHe: string
  intent: 'READ' | 'CREATE_DRAFT' | 'GENERATE' | 'CHANGE' | 'SPEND'
  cards: OperatorActionCard[]
  runId?: string
}

const intentSchema = z.object({
  intent: z.enum(['READ', 'CREATE_DRAFT', 'GENERATE', 'CHANGE', 'SPEND']),
  tool: z.enum([
    'get_performance',
    'create_objective_and_strategy',
    'generate_creatives',
    'create_campaign_draft',
    'explain_best_creative',
    'request_pause_losers',
    'unknown',
  ]),
  dailyBudget: z.number().optional(),
  maxCpl: z.number().optional(),
  targetLeads: z.number().optional(),
  notes: z.string().optional(),
})

async function loadGuardrails(admin: SupabaseClient, organizationId: string, brandId: string): Promise<Guardrails> {
  const { data: brandGuard } = await admin
    .from('mbrain_spending_guardrails')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('brand_id', brandId)
    .eq('scope', 'brand')
    .maybeSingle()
  const { data: orgGuard } = await admin
    .from('mbrain_spending_guardrails')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('scope', 'organization')
    .maybeSingle()
  const raw = brandGuard ?? orgGuard
  return {
    monthly_spend_limit: raw?.monthly_spend_limit != null ? Number(raw.monthly_spend_limit) : null,
    daily_spend_limit: raw?.daily_spend_limit != null ? Number(raw.daily_spend_limit) : null,
    max_campaign_daily_budget:
      raw?.max_campaign_daily_budget != null ? Number(raw.max_campaign_daily_budget) : null,
    max_budget_increase_percentage:
      raw?.max_budget_increase_percentage != null ? Number(raw.max_budget_increase_percentage) : 20,
    max_cpl: raw?.max_cpl != null ? Number(raw.max_cpl) : null,
    auto_pause_enabled: Boolean(raw?.auto_pause_enabled),
    currency: (raw?.currency as string) ?? 'ILS',
  }
}

function classifyHeuristically(message: string): z.infer<typeof intentSchema> {
  const m = message.toLowerCase()
  if (/cpl|למה|ביצוע|קריאייטיב הכי|מנצח|performance|למה ה/.test(m)) {
    if (/קריאייטיב הכי|מנצח/.test(m)) {
      return { intent: 'READ', tool: 'explain_best_creative' }
    }
    return { intent: 'READ', tool: 'get_performance' }
  }
  if (/עצור|השהה|מפסיד|pause/.test(m)) {
    return { intent: 'CHANGE', tool: 'request_pause_losers' }
  }
  if (/וריאצי|קריאייטיב|מודע|generate|צור.*מודע/.test(m)) {
    return { intent: 'GENERATE', tool: 'generate_creatives' }
  }
  if (/השק|launch|תקציב.*יום|קמפיין חדש|תבנה.*קמפיין/.test(m)) {
    const budgetMatch = m.match(/(\d+)\s*₪?\s*ב?יום|יום[^\d]*(\d+)/)
    const daily = budgetMatch
      ? Number(budgetMatch[1] || budgetMatch[2])
      : m.includes('100')
        ? 100
        : undefined
    if (/השק|launch/.test(m)) {
      return { intent: 'SPEND', tool: 'create_campaign_draft', dailyBudget: daily ?? 100, maxCpl: 150, targetLeads: 20 }
    }
    return {
      intent: 'CREATE_DRAFT',
      tool: 'create_objective_and_strategy',
      dailyBudget: daily ?? 100,
      maxCpl: 150,
      targetLeads: 20,
    }
  }
  if (/אסטרטג|יעד|לידים|במקור/.test(m)) {
    return {
      intent: 'CREATE_DRAFT',
      tool: 'create_objective_and_strategy',
      dailyBudget: 100,
      maxCpl: 150,
      targetLeads: 20,
    }
  }
  return { intent: 'READ', tool: 'get_performance', notes: 'fallback' }
}

async function classifyMessage(message: string): Promise<z.infer<typeof intentSchema>> {
  try {
    if ((process.env.AI_PROVIDER ?? 'local') === 'stub' || process.env.MBRAIN_LLM_STUB === '1') {
      return classifyHeuristically(message)
    }
    const llm = getLLMProvider()
    const result = await llm.complete({
      messages: [
        {
          role: 'system',
          content:
            'Classify Hebrew marketing operator commands. Return ONLY JSON with keys: intent (READ|CREATE_DRAFT|GENERATE|CHANGE|SPEND), tool, dailyBudget?, maxCpl?, targetLeads?, notes?. Tools: get_performance, create_objective_and_strategy, generate_creatives, create_campaign_draft, explain_best_creative, request_pause_losers, unknown.',
        },
        { role: 'user', content: message },
      ],
      responseFormatJson: true,
      temperature: 0,
      maxTokens: 400,
    })
    const parsed = intentSchema.safeParse(JSON.parse(result.content))
    if (parsed.success) return parsed.data
  } catch (e) {
    mbrainLog('warn', 'operator_classify_fallback', {
      message: e instanceof Error ? e.message : String(e),
    })
  }
  return classifyHeuristically(message)
}

export async function runOperatorCommand(opts: {
  admin: SupabaseClient
  organizationId: string
  userId: string
  message: string
  brandId?: string
}): Promise<OperatorResult> {
  const brandId = opts.brandId ?? BAMAKOR_BRAND_ID
  const cards: OperatorActionCard[] = [
    { type: 'analyzing', titleHe: 'מנתח בקשה', bodyHe: opts.message },
  ]

  const { data: run } = await opts.admin
    .from('mbrain_agent_runs')
    .insert({
      organization_id: opts.organizationId,
      brand_id: brandId,
      agent: 'ai_operator',
      input: { message: opts.message },
      status: 'running',
    })
    .select('id')
    .single()

  const classified = await classifyMessage(opts.message)
  const guardrails = await loadGuardrails(opts.admin, opts.organizationId, brandId)

  try {
    let result: OperatorResult

    switch (classified.tool) {
      case 'get_performance': {
        const { data: snaps } = await opts.admin
          .from('mbrain_performance_snapshots')
          .select('spend, leads, impressions, clicks, data_source')
          .eq('organization_id', opts.organizationId)
        const rolled = snaps?.length ? rollupKpis(snaps) : null
        const rules = evaluateOptimizationRules({
          spend: rolled?.spend ?? 0,
          leads: rolled?.leads ?? 0,
          clicks: rolled?.clicks ?? 0,
          impressions: rolled?.impressions ?? 0,
          ctr: rolled?.ctr ?? null,
          frequency: null,
          targetCpl: guardrails.max_cpl,
          minSpend: 50,
          minLeads: 3,
          cplMultiplier: 1.5,
        })
        cards.push({
          type: 'performance',
          titleHe: 'ביצועים שמורים',
          bodyHe: rolled
            ? `הוצאה ₪${rolled.spend.toFixed(0)} · לידים ${rolled.leads} · CPL ${rolled.cpl?.toFixed(0) ?? '—'} · CTR ${rolled.ctr?.toFixed(2) ?? '—'}%`
            : 'עדיין אין snapshots — אחרי השקה וסנכרון Insights יופיעו מספרים אמיתיים.',
          meta: { rolled, rules },
        })
        result = {
          replyHe: rolled
            ? `הנה המצב לפי נתונים שמורים (לא המצאה). ${rules[0]?.explanation ?? ''}`
            : 'אין עדיין נתוני ביצועים מסונכרנים. אחרי חיבור Meta והשקה — אוכל להסביר למה CPL עלה.',
          intent: 'READ',
          cards,
        }
        break
      }
      case 'explain_best_creative': {
        const { data: creatives } = await opts.admin
          .from('mbrain_creatives')
          .select('id, headline, hook, angle, status')
          .eq('brand_id', brandId)
          .eq('status', 'approved')
          .limit(5)
        cards.push({
          type: 'info',
          titleHe: 'קריאייטיבים מאושרים',
          bodyHe:
            creatives?.map((c) => `• ${c.headline} — ${c.hook}`).join('\n') ||
            'אין קריאייטיבים מאושרים עדיין. תגיד לי לייצר.',
        })
        result = {
          replyHe:
            creatives?.length
              ? `בלי מספיק Insights אי אפשר להכריז על מנצח לפי CPL. כרגע המאושרים המובילים לפי זווית: ${creatives[0]?.angle}`
              : 'צריך קודם לייצר ולאשר קריאייטיבים.',
          intent: 'READ',
          cards,
        }
        break
      }
      case 'create_objective_and_strategy': {
        const daily = classified.dailyBudget ?? 100
        const maxCpl = classified.maxCpl ?? 150
        const target = classified.targetLeads ?? 20
        const { data: objective, error: objErr } = await opts.admin
          .from('mbrain_marketing_objectives')
          .insert({
            organization_id: opts.organizationId,
            brand_id: brandId,
            title: `לידים מותאמים מחברות ניהול · ₪${daily}/יום · CPL≤₪${maxCpl}`,
            goal_type: 'qualified_leads',
            target_count: target,
            max_cpl: maxCpl,
            total_budget: daily * 30,
            daily_budget: daily,
            market: 'IL',
            audience: 'חברות ניהול נכסים בישראל',
            product_name: 'במקור',
            currency: 'ILS',
            raw_brief: opts.message,
            created_by: opts.userId,
            status: 'draft',
          })
          .select('*')
          .single()
        if (objErr) throw new Error(objErr.message)

        const ctx = await loadBrandContext(opts.admin, opts.organizationId, brandId)
        if (!ctx) throw new Error('מותג לא נמצא')
        const generated = await generateCampaignPlan({ objective, ctx, guardrails })
        const { data: strategy, error: stErr } = await opts.admin
          .from('mbrain_strategies')
          .insert({
            organization_id: opts.organizationId,
            brand_id: brandId,
            objective_id: objective.id,
            version: 1,
            status: 'pending_review',
            plan: generated.plan,
            model_provider: generated.provider,
            model_name: generated.model,
            generation_cost_usd: generated.costUsd,
          })
          .select('*')
          .single()
        if (stErr) throw new Error(stErr.message)

        cards.push({
          type: 'strategy_created',
          titleHe: 'נוצרה אסטרטגיה לאישור',
          bodyHe: `${generated.plan.objective}\nמיצוב: ${generated.plan.positioning}\nתקציב יומי: ₪${daily}`,
          meta: { strategyId: strategy.id, objectiveId: objective.id, source: generated.source },
        })
        result = {
          replyHe:
            ' בניתי יעד ואסטרטגיה מובנית. לפני קמפיין — אשר את האסטרטגיה במסך אסטרטגיה, או בקש ממני לייצר קריאייטיבים.',
          intent: 'CREATE_DRAFT',
          cards,
        }
        break
      }
      case 'generate_creatives': {
        const { data: hyps } = await opts.admin
          .from('mbrain_marketing_hypotheses')
          .select('*')
          .eq('brand_id', brandId)
          .order('sort_order')
          .limit(5)
        const { data: brand } = await opts.admin
          .from('mbrain_brands')
          .select('name')
          .eq('id', brandId)
          .single()
        const imageProvider = getImageGenerationProvider()
        let count = 0
        for (const hyp of hyps ?? []) {
          const copies = generateCopyForHypothesis({
            brandName: brand?.name ?? 'במקור',
            hypothesis: hyp,
          })
          const primary = copies[0]!
          for (const format of ['1:1', '4:5'] as const) {
            const image = await imageProvider.generate({
              prompt: primary.hook,
              aspectRatio: format,
              brandId,
              hypothesisId: hyp.id,
              headline: brand?.name ?? 'במקור',
              subheadline: primary.hook,
            })
            await opts.admin.from('mbrain_creatives').insert({
              organization_id: opts.organizationId,
              brand_id: brandId,
              hypothesis_id: hyp.id,
              status: 'pending_review',
              format,
              angle: primary.angle,
              hook: primary.hook,
              primary_text: primary.primaryText,
              headline: primary.headline,
              description: primary.description,
              cta: primary.cta,
              offer: primary.offer,
              target_pain: primary.targetPain,
              target_persona: primary.targetPersona,
              image_prompt: image.prompt,
              image_provider: image.provider,
              image_kind: image.kind,
              image_content: image.content,
            })
            count += 1
          }
        }
        cards.push({
          type: 'generated_creatives',
          titleHe: `נוצרו ${count} קריאייטיבים`,
          bodyHe: 'אשר/דחה במסך קריאייטיב לפני בניית קמפיין.',
          meta: { count },
        })
        result = {
          replyHe: `יצרתי ${count} וריאציות מקושרות להשערות. עבור לאישור קריאייטיב ואז נבנה קמפיין.`,
          intent: 'GENERATE',
          cards,
        }
        break
      }
      case 'create_campaign_draft': {
        const { data: strategy } = await opts.admin
          .from('mbrain_strategies')
          .select('id')
          .eq('brand_id', brandId)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!strategy) {
          result = {
            replyHe: 'אין אסטרטגיה מאושרת. קודם ניצור/נאשר אסטרטגיה, אחר כך טיוטת קמפיין להשקה.',
            intent: 'CREATE_DRAFT',
            cards: [
              ...cards,
              {
                type: 'info',
                titleHe: 'חסר אישור אסטרטגיה',
                bodyHe: 'אפשר לבקש ממני: "תבנה לי קמפיין לידים חדש לבמקור"',
              },
            ],
          }
          break
        }
        const draft = await createCampaignDraftFromStrategy(opts.admin, {
          organizationId: opts.organizationId,
          brandId,
          strategyId: strategy.id,
          landingPageUrl: 'https://bamakor.vercel.app',
          guardrails,
        })
        await opts.admin
          .from('mbrain_campaigns')
          .update({ status: 'pending_approval' })
          .eq('id', draft.campaign.id)
        const approval = await requestApproval(opts.admin, {
          organizationId: opts.organizationId,
          brandId,
          actionType: 'launch_campaign',
          targetType: 'campaign',
          targetId: draft.campaign.id as string,
          requestedBy: opts.userId,
          budgetApproved: Number(draft.campaign.daily_budget ?? 0),
          payload: {
            dailyBudget: Number(draft.campaign.daily_budget ?? 0),
            projectedMonthlySpend: Number(draft.campaign.daily_budget ?? 0) * 30,
            preview: draft.preview,
            idempotencyKey: draft.idempotencyKey,
          },
          guardrails,
        })
        cards.push({
          type: 'campaign_draft',
          titleHe: 'טיוטת קמפיין מוכנה',
          bodyHe: `תקציב יומי ₪${draft.campaign.daily_budget} · מקס׳ חודשי משוער ₪${Number(draft.campaign.daily_budget ?? 0) * 30}`,
          meta: { campaignId: draft.campaign.id, preview: draft.preview },
        })
        cards.push({
          type: 'approval_required',
          titleHe: 'נדרש אישור השקה',
          bodyHe: 'פעולת SPEND — אשר ב־/brain/approvals לפני יצירת אובייקטים ב-Meta.',
          meta: { approvalId: approval.id },
        })
        result = {
          replyHe: 'הכנתי טיוטה ובקשת אישור השקה. בלי האישור שלך לא יוצא כסף.',
          intent: 'SPEND',
          cards,
        }
        break
      }
      case 'request_pause_losers': {
        cards.push({
          type: 'approval_required',
          titleHe: 'השהיית מפסידים',
          bodyHe:
            'במצב SUPERVISED אוכל להשהות אוטומטית רק לפי כללים + אישור. כרגע אין מספיק Insights לפעולה בטוחה, או שצריך לאשר המלצה מהדוח היומי.',
        })
        result = {
          replyHe: 'לא עוצר מודעות בלי דאטה ומדיניות. בדוק המלצות בביצועים/אישורים.',
          intent: 'CHANGE',
          cards,
        }
        break
      }
      default:
        result = {
          replyHe:
            'אני מנהל השיווק שלך. אפשר לבקש: לבנות קמפיין לידים, לייצר קריאייטיבים, להסביר ביצועים, או להכין השקה לאישור.',
          intent: 'READ',
          cards,
        }
    }

    if (run?.id) {
      await opts.admin
        .from('mbrain_agent_runs')
        .update({
          status: 'completed',
          result: { intent: result.intent, tool: classified.tool, cards: result.cards },
          tools_used: [classified.tool],
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id)
      result.runId = run.id
    }
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (run?.id) {
      await opts.admin
        .from('mbrain_agent_runs')
        .update({ status: 'failed', error_message: message, finished_at: new Date().toISOString() })
        .eq('id', run.id)
    }
    return {
      replyHe: `לא הצלחתי להשלים: ${message}`,
      intent: classified.intent,
      cards: [...cards, { type: 'error', titleHe: 'שגיאה', bodyHe: message }],
      runId: run?.id,
    }
  }
}
