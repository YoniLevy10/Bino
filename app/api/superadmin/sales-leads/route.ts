import { NextRequest, NextResponse } from 'next/server'
import {
  isSuperAdminRequest,
  superAdminUnauthorizedResponse,
} from '@/lib/superadmin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  deleteSalesLeadsBulk,
  getLeadCounters,
  listRecentRuns,
  listSalesLeads,
} from '@/lib/sales-leads/service'
import type { LeadStatus } from '@/lib/sales-leads/types'
import { LEAD_STATUSES } from '@/lib/sales-leads/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const url = req.nextUrl
  const q = url.searchParams.get('q') ?? undefined
  const city = url.searchParams.get('city') ?? undefined
  const segmentSlug = url.searchParams.get('segment') ?? undefined
  const statusRaw = url.searchParams.get('status')
  const fitClass = url.searchParams.get('fitClass') ?? undefined
  const contactability = url.searchParams.get('contactability') ?? undefined
  const minFitScoreRaw = url.searchParams.get('minFitScore')
  const sortRaw = url.searchParams.get('sort')
  const limit = Number(url.searchParams.get('limit') ?? 100)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  let status: LeadStatus | LeadStatus[] | undefined
  if (statusRaw) {
    const parts = statusRaw
      .split(',')
      .filter((s): s is LeadStatus => (LEAD_STATUSES as readonly string[]).includes(s))
    if (parts.length === 1) status = parts[0]
    else if (parts.length > 1) status = parts
  }

  const minFitScore =
    minFitScoreRaw && Number.isFinite(Number(minFitScoreRaw))
      ? Number(minFitScoreRaw)
      : undefined

  const sort =
    sortRaw === 'created_at' || sortRaw === 'estimated_mrr' || sortRaw === 'fit_score'
      ? sortRaw
      : 'fit_score'

  try {
    const admin = getSupabaseAdmin()
    const [{ leads, total }, counters, runs] = await Promise.all([
      listSalesLeads(admin, {
        q,
        city,
        segmentSlug,
        status,
        fitClass: fitClass || undefined,
        contactability: contactability || undefined,
        minFitScore,
        sort,
        limit,
        offset,
      }),
      getLeadCounters(admin),
      listRecentRuns(admin, 8),
    ])
    return NextResponse.json({ leads, total, counters, runs })
  } catch (e) {
    console.error('[superadmin.sales-leads]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: NextRequest) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

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
