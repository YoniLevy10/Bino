import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function isAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET?.trim()
  if (!secret) return false
  return (req.headers.get('x-admin-secret') ?? '') === secret
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = typeof body === 'object' && body !== null && 'email' in body
    ? String((body as Record<string, unknown>).email ?? '')
    : ''

  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const link = (data as unknown as { properties?: { action_link?: string } })?.properties?.action_link
  if (!link) {
    return NextResponse.json({ error: 'No link generated' }, { status: 500 })
  }

  return NextResponse.json({ link })
}
