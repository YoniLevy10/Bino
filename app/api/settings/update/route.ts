import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'

const ALLOWED_FIELDS = [
  'manager_phone',
  'default_worker_phone',
  'sms_sender_name',
  'sms_on_ticket_open',
  'sms_on_ticket_close',
  'whatsapp_business_phone',
  'whatsapp_phone_number_id',
  'whatsapp_access_token',
] as const

export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response
  const { clientId } = auth.ctx

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) payload[key] = (body as Record<string, unknown>)[key]
  }

  if (!Object.keys(payload).length) {
    return NextResponse.json({ error: 'no recognised fields to update' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('clients').update(payload).eq('id', clientId)

  if (error) {
    console.error('[settings/update] supabase error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
