import { NextResponse } from 'next/server'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { recommendationActionBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { recordRecommendationEvent } from '@/lib/recommendations/record-event'
import { validateRecommendationRelevance } from '@/lib/recommendations/validate-recommendation'
import {
  loadEnabledAddonKeys,
  parseActions,
  presentRecommendation,
} from '@/lib/recommendations/entitlements'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'

/**
 * Records that the manager chose an action. Does NOT mark the recommendation resolved.
 * Opening a card / clicking a button is not completion.
 */
export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'recommendations-action')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = recommendationActionBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }

  const clientId = auth.ctx.clientId
  const { data: row, error } = await admin
    .from('management_recommendations')
    .select('*')
    .eq('id', parsed.data.id)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'המלצה לא נמצאה' }, { status: 404 })

  const typed = row as ManagementRecommendationRow
  const stillRelevant = await validateRecommendationRelevance(admin, typed)
  if (!stillRelevant) {
    return NextResponse.json(
      { error: 'ההמלצה כבר אינה רלוונטית', code: 'NOT_RELEVANT' },
      { status: 409 }
    )
  }

  const enabledAddons = await loadEnabledAddonKeys(admin, clientId)
  const presented = presentRecommendation(typed, enabledAddons)
  if (!presented) {
    return NextResponse.json({ error: 'אין הרשאה לפעולה זו', code: 'ADDON_REQUIRED' }, { status: 403 })
  }

  const actions = parseActions(presented.actions)
  const action = actions.find((a) => a.id === parsed.data.action_id)
  if (!action) {
    return NextResponse.json({ error: 'פעולה לא זמינה' }, { status: 400 })
  }

  await recordRecommendationEvent(admin, {
    clientId,
    recommendationId: typed.id,
    eventType: 'action_chosen',
    actor: auth.ctx.userId,
    meta: { action_id: action.id, href: action.href ?? null },
  })

  await admin
    .from('management_recommendations')
    .update({
      acted_by: auth.ctx.userId,
      acted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', typed.id)
    .eq('client_id', clientId)

  return NextResponse.json({
    ok: true,
    action_id: action.id,
    href: action.href ?? presented.primary_action_href,
    kind: action.kind ?? 'navigate',
    // Explicit: choosing an action is not completion
    resolved: false,
  })
}
