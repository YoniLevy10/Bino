import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { enrichSalesLeadsBatch } from '@/lib/sales-leads/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Harvest emails / wa.me / phones from lead websites (manual sales enrichment only). */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const result = await enrichSalesLeadsBatch(admin, 25)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron.enrich-sales-leads]', error)
    return NextResponse.json({ error: 'Enrichment failed' }, { status: 500 })
  }
}
