import { NextRequest, NextResponse } from 'next/server'
import {
  isSuperAdminRequest,
  superAdminUnauthorizedResponse,
} from '@/lib/superadmin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLeadCounters, listRecentRuns, listSalesLeads } from '@/lib/sales-leads/service'
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
  const limit = Number(url.searchParams.get('limit') ?? 50)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  let status: LeadStatus | LeadStatus[] | undefined
  if (statusRaw) {
    const parts = statusRaw.split(',').filter((s): s is LeadStatus =>
      (LEAD_STATUSES as readonly string[]).includes(s),
    )
    status = parts.length === 1 ? parts[0] : parts
  }

  try {
    const admin = getSupabaseAdmin()
    const [{ leads, total }, counters, runs] = await Promise.all([
      listSalesLeads(admin, {
        q,
        city,
        segmentSlug,
        status,
        fitClass: fitClass || undefined,
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
