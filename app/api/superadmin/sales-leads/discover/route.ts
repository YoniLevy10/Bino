import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/superadmin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isGooglePlacesConfigured } from '@/lib/sales-leads/config'
import {
  getLatestDiscoveryProgress,
  runSalesLeadDiscovery,
} from '@/lib/sales-leads/discover'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response
  try {
    const admin = getSupabaseAdmin()
    const progress = await getLatestDiscoveryProgress(admin)
    return NextResponse.json(progress)
  } catch (e) {
    console.error('[superadmin.sales-leads.discover.GET]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'status failed' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  let body: {
    city?: string
    segmentSlugs?: string[]
    sources?: Array<'google_places' | 'osm'>
  } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  try {
    if (!isGooglePlacesConfigured()) {
      return NextResponse.json(
        {
          status: 'failed',
          error: 'חסר GOOGLE_PLACES_API_KEY',
          errorMessage:
            'חסר מפתח Google Places — הגדירו GOOGLE_PLACES_API_KEY (או GOOGLE_MAPS_API_KEY) ב-Vercel, הפעילו Places API (New), והוסיפו חיוב ל-Google Cloud.',
          placesConfigured: false,
          found: 0,
          created: 0,
        },
        { status: 503 },
      )
    }

    const admin = getSupabaseAdmin()
    const result = await runSalesLeadDiscovery(admin, {
      trigger: 'manual',
      city: body.city?.trim() || undefined,
      segmentSlugs: body.segmentSlugs,
      sources: body.sources,
    })
    return NextResponse.json(
      { ...result, placesConfigured: true },
      {
        status: result.status === 'failed' ? 500 : 200,
      },
    )
  } catch (e) {
    console.error('[superadmin.sales-leads.discover]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'discover failed' },
      { status: 500 },
    )
  }
}
