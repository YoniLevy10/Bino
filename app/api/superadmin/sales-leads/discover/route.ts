import { NextRequest, NextResponse } from 'next/server'
import {
  isSuperAdminRequest,
  superAdminUnauthorizedResponse,
} from '@/lib/superadmin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { runSalesLeadDiscovery } from '@/lib/sales-leads/discover'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  let body: { city?: string; segmentSlugs?: string[] } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  try {
    const admin = getSupabaseAdmin()
    const result = await runSalesLeadDiscovery(admin, {
      trigger: 'manual',
      city: body.city?.trim() || undefined,
      segmentSlugs: body.segmentSlugs,
    })
    return NextResponse.json(result, {
      status: result.status === 'failed' ? 500 : 200,
    })
  } catch (e) {
    console.error('[superadmin.sales-leads.discover]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'discover failed' },
      { status: 500 },
    )
  }
}
