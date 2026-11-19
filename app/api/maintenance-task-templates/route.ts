import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { templateSetUpsertBodySchema } from '@/lib/api-body-schemas'
import { BUILDING_MAINTENANCE_TEMPLATES } from '@/lib/maintenance/maintenance-task-templates'

export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('maintenance_task_template_sets')
    .select('id, name, items, created_at, updated_at')
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    builtin: BUILDING_MAINTENANCE_TEMPLATES,
    sets: data || [],
  })
}

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'maintenance-template-sets'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = templateSetUpsertBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const now = new Date().toISOString()
  if (parsed.data.id) {
    const { data, error } = await admin
      .from('maintenance_task_template_sets')
      .update({
        name: parsed.data.name.trim(),
        items: parsed.data.items,
        updated_at: now,
      })
      .eq('id', parsed.data.id)
      .eq('client_id', auth.ctx.clientId)
      .is('deleted_at', null)
      .select('id, name, items, created_at, updated_at')
      .maybeSingle()
    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'לא נמצא' }, { status: 404 })
    }
    return NextResponse.json({ set: data })
  }

  const { data, error } = await admin
    .from('maintenance_task_template_sets')
    .insert({
      client_id: auth.ctx.clientId,
      name: parsed.data.name.trim(),
      items: parsed.data.items,
    })
    .select('id, name, items, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ set: data })
}
