import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { LEVY_ORG_ID } from '@/lib/mbrain/types'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const bodySchema = z.object({
  organizationSlug: z.string().default('levy-marketing'),
  role: z.enum(['owner', 'admin', 'analyst', 'viewer']).default('owner'),
})

/**
 * Bootstrap: attach the current authenticated user to the seeded Levy org
 * when they have no mbrain membership yet.
 * Protected by ADMIN_SETUP_SECRET when the org already has members.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 })

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 })
  }

  const rl = await checkAuthenticatedPostRouteLimit(admin, user.id, 'mbrain-bootstrap')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const { data: existing } = await admin
    .from('mbrain_organization_members')
    .select('id, organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ membership: existing, alreadyMember: true })
  }

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const { data: org } = await admin
    .from('mbrain_organizations')
    .select('id, slug')
    .eq('slug', parsed.data.organizationSlug)
    .maybeSingle()

  const organizationId = org?.id ?? LEVY_ORG_ID

  const { count } = await admin
    .from('mbrain_organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)

  if ((count ?? 0) > 0) {
    const setupSecret = req.headers.get('x-admin-secret')
    const expected = process.env.ADMIN_SETUP_SECRET
    if (!expected || setupSecret !== expected) {
      return NextResponse.json(
        { error: 'נדרש ADMIN_SETUP_SECRET להצטרפות לארגון קיים' },
        { status: 403 }
      )
    }
  }

  const { data: membership, error } = await admin
    .from('mbrain_organization_members')
    .insert({
      organization_id: organizationId,
      user_id: user.id,
      role: parsed.data.role,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeMbrainAudit(admin, {
    organizationId,
    actorUserId: user.id,
    action: 'membership.bootstrap',
    entityType: 'organization_member',
    entityId: membership.id,
    after: { role: membership.role, user_id: user.id },
  })

  return NextResponse.json({ membership, alreadyMember: false }, { status: 201 })
}
