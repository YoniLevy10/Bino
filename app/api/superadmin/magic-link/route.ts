import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/superadmin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'


export async function POST(req: Request) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

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
