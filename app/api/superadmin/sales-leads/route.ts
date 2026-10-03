import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/superadmin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isGooglePlacesConfigured } from '@/lib/sales-leads/config'
import {
  deleteSalesLeadsBulk,
  getLeadCounters,
  listRecentRuns,
} from '@/lib/sales-leads/service'
import {
  getFunnelCounters,
  listFunnelLeads,
} from '@/lib/sales-leads/funnel/service'
import { recoverStaleDiscoveryRuns } from '@/lib/sales-leads/query-stats-store'
import {
  listActiveOperators,
  syncOperatorsFromEnv,
} from '@/lib/sales-leads/operators'
import { isInterestLevel, isLeadStage, LEAD_STAGES } from '@/lib/sales-leads/funnel/model'
import type { InterestLevel, LeadStage, LeadWorkView } from '@/lib/sales-leads/types'

export const dynamic = 'force-dynamic'

const WORK_VIEWS: LeadWorkView[] = [
  'active',
  'mine',
  'due_today',
  'overdue',
  'interested',
  'needs_completion',
  'waiting',
  'customers',
  'lost',
  'deferred',
  'all',
]

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const url = req.nextUrl
  const q = url.searchParams.get('q') ?? undefined
  const city = url.searchParams.get('city') ?? undefined
  const segmentSlug = url.searchParams.get('segment') ?? undefined
  const statusRaw = url.searchParams.get('status')
  const fitClass = url.searchParams.get('fitClass') ?? undefined
  const contactability = url.searchParams.get('contactability') ?? undefined
  const minFitScoreRaw = url.searchParams.get('minFitScore')
  const sortRaw = url.searchParams.get('sort')
  const viewRaw = url.searchParams.get('view') ?? 'active'
  const interestRaw = url.searchParams.get('interest')
  const ownerRaw = url.searchParams.get('owner')
  const viewerOperatorId = url.searchParams.get('viewerOperatorId') ?? undefined
  const limit = Number(url.searchParams.get('limit') ?? 100)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  const view = (WORK_VIEWS as string[]).includes(viewRaw)
    ? (viewRaw as LeadWorkView)
    : 'active'

  let status: LeadStage | LeadStage[] | undefined
  if (statusRaw) {
    const parts = statusRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is LeadStage => isLeadStage(s))
    if (parts.length === 1) status = parts[0]
    else if (parts.length > 1) status = parts
  }

  let interestLevel: InterestLevel | InterestLevel[] | undefined
  if (interestRaw) {
    const parts = interestRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is InterestLevel => isInterestLevel(s))
    if (parts.length === 1) interestLevel = parts[0]
    else if (parts.length > 1) interestLevel = parts
  }

  const minFitScore =
    minFitScoreRaw && Number.isFinite(Number(minFitScoreRaw))
      ? Number(minFitScoreRaw)
      : undefined

  const sort:
    | 'created_at'
    | 'estimated_mrr'
    | 'fit_score'
    | 'next_contact'
    | 'updated_at' =
    sortRaw === 'created_at' ||
    sortRaw === 'estimated_mrr' ||
    sortRaw === 'fit_score' ||
    sortRaw === 'next_contact' ||
    sortRaw === 'updated_at'
      ? sortRaw
      : 'next_contact'

  try {
    const admin = getSupabaseAdmin()
    await recoverStaleDiscoveryRuns(admin)

    const operators = await syncOperatorsFromEnv(admin).catch(async () => listActiveOperators(admin))

    const listFilters = {
      q,
      city,
      segmentSlug,
      status,
      fitClass: fitClass || undefined,
      contactability: contactability || undefined,
      minFitScore,
      interestLevel,
      ownerOperatorId: ownerRaw === 'none' ? 'none' : ownerRaw || undefined,
      view,
      viewerOperatorId: viewerOperatorId || undefined,
      sort,
      limit,
      offset,
    }

    const [{ leads, total, dayBounds }, funnelCounters, legacyCounters, runs] =
      await Promise.all([
        listFunnelLeads(admin, listFilters),
        getFunnelCounters(admin, listFilters),
        getLeadCounters(admin),
        listRecentRuns(admin, 8),
      ])

    return NextResponse.json({
      leads,
      total,
      counters: {
        ...legacyCounters,
        funnel: funnelCounters,
      },
      funnelCounters,
      operators,
      stages: LEAD_STAGES,
      view,
      dayBounds: {
        ymd: dayBounds.ymd,
        dayStartIso: dayBounds.dayStartIso,
        dayEndIso: dayBounds.dayEndIso,
        timezone: 'Asia/Jerusalem',
      },
      runs,
      placesConfigured: isGooglePlacesConfigured(),
      operatorsConfigured: operators.length > 0,
    })
  } catch (e) {
    console.error('[superadmin.sales-leads]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  let body: { ids?: string[] } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const ids = Array.isArray(body.ids) ? body.ids : []
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }

  try {
    const admin = getSupabaseAdmin()
    const result = await deleteSalesLeadsBulk(admin, ids)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'delete failed' },
      { status: 500 },
    )
  }
}
