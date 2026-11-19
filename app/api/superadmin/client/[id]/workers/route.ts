import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSuperAdmin } from '@/lib/superadmin/superadmin-auth'
import { parseWorkerPhone } from '@/lib/worker/worker-phones'

const workerSchema = z.object({
  full_name: z.string().min(1).max(200),
  phone: z.string().min(6).max(40),
  email: z.string().email().optional(),
  role: z.string().max(100).optional(),
})

const bodySchema = z.object({
  workers: z.array(workerSchema).min(1).max(200),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { id: clientId } = await params
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('workers')
    .select('id, full_name, phone, email, role, is_active')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ workers: data ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { id: clientId } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: client } = await admin.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('client_id', clientId)
    .limit(1)
    .maybeSingle()
  const orgId = (org as { id?: string } | null)?.id ?? null

  const inserts: Array<{
    client_id: string
    organization_id: string | null
    full_name: string
    phone: string
    email: string | null
    role: string | null
    is_active: boolean
  }> = []

  for (const w of parsed.data.workers) {
    const phoneParsed = parseWorkerPhone(w.phone, 'מספר טלפון עובד')
    if (!phoneParsed.ok) {
      return NextResponse.json({ error: phoneParsed.error }, { status: 400 })
    }
    inserts.push({
      client_id: clientId,
      organization_id: orgId,
      full_name: w.full_name.trim(),
      phone: phoneParsed.normalized,
      email: w.email ?? null,
      role: w.role ?? null,
      is_active: true,
    })
  }

  const { data: rows, error } = await admin
    .from('workers')
    .insert(inserts)
    .select('id, full_name, phone')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, workers: rows ?? [], created: rows?.length ?? 0 })
}
