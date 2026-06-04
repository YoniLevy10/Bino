import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { z } from 'zod'

function isAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET?.trim()
  if (!secret) return false
  return (req.headers.get('x-admin-secret') ?? '') === secret
}

const patchSchema = z.object({
  addons: z.array(
    z.object({
      addon_key: z.string().min(1).max(64),
      enabled: z.boolean(),
      notes: z.string().max(500).nullable().optional(),
    })
  ).min(1).max(30),
})

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: clientId } = await params
  const admin = getSupabaseAdmin()

  const [catalogRes, subsRes] = await Promise.all([
    admin.from('paid_addons_catalog').select('addon_key, name_he, price_ils_monthly, is_active').order('sort_order'),
    admin.from('client_paid_addons').select('addon_key, enabled, notes, enabled_at').eq('client_id', clientId),
  ])

  if (catalogRes.error) {
    return NextResponse.json({ error: catalogRes.error.message }, { status: 500 })
  }

  const subsByKey = new Map(
    (subsRes.data || []).map((s) => [(s as { addon_key: string }).addon_key, s])
  )

  const rows = (catalogRes.data || []).map((c) => {
    const sub = subsByKey.get((c as { addon_key: string }).addon_key)
    return {
      ...c,
      enabled: !!(sub && (sub as { enabled: boolean }).enabled),
      notes: (sub as { notes?: string | null } | undefined)?.notes ?? null,
    }
  })

  return NextResponse.json({ client_id: clientId, addons: rows })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: clientId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: clientCheck } = await admin.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!clientCheck) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  for (const row of parsed.data.addons) {
    if (row.enabled) {
      const { error } = await admin.from('client_paid_addons').upsert(
        {
          client_id: clientId,
          addon_key: row.addon_key,
          enabled: true,
          enabled_at: now,
          notes: row.notes ?? null,
          updated_at: now,
        },
        { onConflict: 'client_id,addon_key' }
      )
      if (error) {
        return NextResponse.json({ error: error.message, addon_key: row.addon_key }, { status: 500 })
      }
    } else {
      const { error } = await admin
        .from('client_paid_addons')
        .update({ enabled: false, updated_at: now, notes: row.notes ?? null })
        .eq('client_id', clientId)
        .eq('addon_key', row.addon_key)
      if (error) {
        return NextResponse.json({ error: error.message, addon_key: row.addon_key }, { status: 500 })
      }
    }
  }

  const { data: enabled } = await admin
    .from('client_paid_addons')
    .select('addon_key, enabled')
    .eq('client_id', clientId)
    .eq('enabled', true)

  return NextResponse.json({
    client_id: clientId,
    enabled_keys: (enabled || []).map((r) => (r as { addon_key: string }).addon_key),
  })
}
