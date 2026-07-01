import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminRequest(_req)) return superAdminUnauthorizedResponse()

  const { id } = await params
  if (!id?.trim()) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('error_logs')
    .update({ resolved: true, resolved_at: now })
    .eq('id', id)
    .select('id, resolved, resolved_at')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, error_log: data })
}
