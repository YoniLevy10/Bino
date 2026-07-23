import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimitIpEndpoint, sanitizeId } from '@/lib/api-validation'

/**
 * Public client branding for /intake (and similar unauthenticated pages).
 * Returns only logo_url + display name — no secrets.
 */
export async function GET(req: NextRequest) {
  const requestId = `client-branding-${Date.now()}`
  try {
    const admin = getSupabaseAdmin()
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
    const rl = await checkRateLimitIpEndpoint({
      supabaseAdmin: admin,
      ip,
      endpoint: 'GET /api/public/client-branding',
      maxRequests: 30,
    })
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות, נסה שוב בעוד דקה' }, { status: 429 })
    }

    const clientId = sanitizeId(req.nextUrl.searchParams.get('client_id'))
    if (!clientId) {
      return NextResponse.json({ error: 'Invalid request', requestId }, { status: 400 })
    }

    const { data, error } = await admin
      .from('clients')
      .select('id, name, logo_url')
      .eq('id', clientId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'לא נמצא', requestId }, { status: 404 })
    }

    return NextResponse.json({
      client: {
        id: data.id,
        name: data.name || null,
        logo_url: data.logo_url || null,
      },
      requestId,
    })
  } catch {
    return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
  }
}
