import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'
import { buildOpsIntelligenceReport } from '@/lib/ops-intelligence-analytics'

export async function GET(req: Request) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const url = new URL(req.url)
  const daysRaw = Number(url.searchParams.get('days') ?? '90')
  const lookbackDays = Number.isFinite(daysRaw) ? Math.min(365, Math.max(7, Math.floor(daysRaw))) : 90

  try {
    const admin = getSupabaseAdmin()
    const report = await buildOpsIntelligenceReport(admin, lookbackDays)
    return NextResponse.json(report)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
