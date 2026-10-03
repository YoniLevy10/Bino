import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { runClientDetectors } from '@/lib/recommendations/run-client-detectors'
import { filterRelevantRecommendations } from '@/lib/recommendations/validate-recommendation'
import { rankRecommendations } from '@/lib/recommendations/rank'
import {
  loadEnabledAddonKeys,
  presentRecommendation,
} from '@/lib/recommendations/entitlements'
import { recordRecommendationEvent } from '@/lib/recommendations/record-event'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'
import { runAfterResponse } from '@/lib/run-after-response'

const STALE_MS = 5 * 60_000

export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'recommendations-list')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const clientId = auth.ctx.clientId
  const url = req.nextUrl
  const entityType = url.searchParams.get('entity_type')?.trim() || ''
  const entityId = url.searchParams.get('entity_id')?.trim() || ''
  const refresh = url.searchParams.get('refresh') === '1'
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || '20') || 20))

  // Stale-while-revalidate: never block dashboard nav on detector scan.
  // Default GET returns cached rows immediately; refresh=1 awaits a fresh scan.
  const { data: latest } = await admin
    .from('management_recommendations')
    .select('updated_at')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastUpdated = latest?.updated_at ? new Date(latest.updated_at as string).getTime() : 0
  const isStale = !lastUpdated || Date.now() - lastUpdated > STALE_MS
  let scan: { drafts: number; upserted: number; cleared: number } | null = null
  if (refresh) {
    scan = await runClientDetectors(admin, clientId)
  } else if (isStale) {
    runAfterResponse(`recommendations-detectors:${clientId}`, async () => {
      await runClientDetectors(admin, clientId)
    })
  }

  let query = admin
    .from('management_recommendations')
    .select('*')
    .eq('client_id', clientId)
    .in('status', ['active', 'snoozed'])
    .order('detected_at', { ascending: true })
    .limit(100)

  if (entityType && entityId) {
    query = query.eq('entity_type', entityType).eq('entity_id', entityId)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const enabledAddons = await loadEnabledAddonKeys(admin, clientId)
  const rows = (data || []) as ManagementRecommendationRow[]
  const relevant = await filterRelevantRecommendations(admin, rows)
  const presented = relevant
    .map((r) => presentRecommendation(r, enabledAddons))
    .filter((r): r is ManagementRecommendationRow => !!r)
  const ranked = rankRecommendations(presented).slice(0, limit)

  // Record shown (best-effort, once per fetch batch)
  for (const row of ranked.slice(0, 3)) {
    void recordRecommendationEvent(admin, {
      clientId,
      recommendationId: row.id,
      eventType: 'shown',
      actor: auth.ctx.userId,
    })
  }

  return NextResponse.json({
    recommendations: ranked,
    total: ranked.length,
    scan,
  })
}
