import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionMinRole } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { settingsUpdateBodySchema } from '@/lib/api-body-schemas'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/format-zod-error'

export async function POST(req: Request) {
  const auth = await requireSessionMinRole('admin')
  if (!auth.ok) return auth.response
  const { clientId, userId } = auth.ctx

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, userId, 'settings-update')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const rawBody = await req.json().catch(() => null)
  const validated = settingsUpdateBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const payload = validated.data as Record<string, unknown>

  const { error } = await admin.from('clients').update(payload).eq('id', clientId)

  if (error) {
    console.error('[settings/update] supabase error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAudit({
    clientId,
    userId,
    action: 'UPDATE_CLIENT_SETTINGS',
    entityType: 'client',
    entityId: clientId,
    newValues: { fields: Object.keys(payload) },
  })

  return NextResponse.json({ ok: true })
}
