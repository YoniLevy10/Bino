import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { runSalesLeadDiscovery } from '@/lib/sales-leads/discover'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Daily Israel sales-lead discovery (Google Places + OSM) → sales_leads */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const result = await runSalesLeadDiscovery(admin, { trigger: 'cron' })
    return NextResponse.json(result, {
      status: result.status === 'failed' ? 500 : 200,
    })
  } catch (error) {
    console.error('[cron.discover-sales-leads]', error)
    return NextResponse.json({ error: 'Discovery failed' }, { status: 500 })
  }
}
