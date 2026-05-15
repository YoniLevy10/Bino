import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimitIpEndpoint, sanitizeId, sanitizeString } from '@/lib/api-validation'

/**
 * Public building list for /report: scoped by client_id + optional search / project code.
 * No anon RLS on projects — all access validated here.
 */
export async function GET(req: NextRequest) {
  const requestId = `public-projects-${Date.now()}`
  try {
    const admin = getSupabaseAdmin()
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
    const rl = await checkRateLimitIpEndpoint({
      supabaseAdmin: admin,
      ip,
      endpoint: 'GET /api/public/projects',
      maxRequests: 20,
    })
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות, נסה שוב בעוד דקה' }, { status: 429 })
    }

    const { searchParams } = req.nextUrl
    const clientId = sanitizeId(searchParams.get('client_id'))
    if (!clientId) {
      return NextResponse.json({ error: 'Invalid request', requestId }, { status: 400 })
    }

    const projectCode = sanitizeString(searchParams.get('project') || '').toUpperCase()
    const q = sanitizeString(searchParams.get('q') || '').trim().toLowerCase()

    if (projectCode) {
      const { data, error } = await admin
        .from('projects')
        .select('id, name, project_code, client_id')
        .eq('client_id', clientId)
        .eq('project_code', projectCode)
        .eq('is_active', true)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
      }
      return NextResponse.json({ projects: data ? [data] : [], requestId })
    }

    if (q.length < 2) {
      return NextResponse.json({ projects: [], requestId })
    }

    const { data: rows, error } = await admin
      .from('projects')
      .select('id, name, project_code, client_id, address, address_en')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('project_code', { ascending: true })
      .limit(80)

    if (error) {
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    const list = (rows || []) as {
      id: string
      name: string
      project_code: string
      client_id: string
      address?: string | null
      address_en?: string | null
    }[]

    const filtered = list.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q) ||
        (p.address_en || '').toLowerCase().includes(q) ||
        (p.project_code || '').toLowerCase().includes(q)
    )

    return NextResponse.json({
      projects: filtered.slice(0, 10).map(({ id, name, project_code, client_id }) => ({
        id,
        name,
        project_code,
        client_id,
      })),
      requestId,
    })
  } catch {
    return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
  }
}
