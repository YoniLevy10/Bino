import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSuperAdmin } from '@/lib/superadmin/superadmin-auth'

const projectSchema = z.object({
  name: z.string().min(1).max(200),
  project_code: z.string().min(1).max(40),
  address: z.string().max(500).optional(),
})

const bodySchema = z.object({
  projects: z.array(projectSchema).min(1).max(200),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { id: clientId } = await params
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('projects')
    .select('id, name, project_code, address, is_active')
    .eq('client_id', clientId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projects: data ?? [] })
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
  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle()
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('client_id', clientId)
    .limit(1)
    .maybeSingle()

  const orgId = (org as { id?: string } | null)?.id ?? null

  const inserts = parsed.data.projects.map((p) => ({
    client_id: clientId,
    organization_id: orgId,
    name: p.name.trim(),
    project_code: p.project_code.trim().toUpperCase(),
    address: p.address?.trim() || null,
    qr_identifier: `START_${p.project_code.trim().toUpperCase()}`,
    is_active: true,
  }))

  const { data: rows, error } = await admin
    .from('projects')
    .insert(inserts)
    .select('id, name, project_code, address')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, projects: rows ?? [], created: rows?.length ?? 0 })
}
