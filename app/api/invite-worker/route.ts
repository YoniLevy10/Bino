import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientId, requireSessionMinRole } from '@/lib/api-auth'
import { canAssignOrgRole, type OrgUserRole } from '@/lib/org-roles'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { z } from 'zod'

const inviteWorkerSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'viewer']).default('viewer'),
})

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `invite-worker-${Date.now()}`

  try {
    const auth = await requireSessionMinRole('admin')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(supabase, auth.ctx.userId, 'invite-worker')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const parsed = inviteWorkerSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { email, role } = parsed.data
    const clientId = auth.ctx.clientId

    if (!canAssignOrgRole(auth.ctx.role, role as OrgUserRole)) {
      return NextResponse.json(
        { error: 'אין הרשאה להקצות תפקיד זה', requestId },
        { status: 403 }
      )
    }

    // מצא את ה-organization של הלקוח
    const { data: orgRows, error: orgErr } = await supabase
      .from('organizations')
      .select('id')
      .eq('client_id', clientId)
      .limit(1)

    if (orgErr || !orgRows?.length) {
      return NextResponse.json({ error: 'לא נמצאה ארגון מקושר ללקוח', requestId }, { status: 404 })
    }
    const orgId = orgRows[0].id

    // שלח invite דרך Supabase Auth
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || ''
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/callback`,
      data: { invited_as_worker: true, client_id: clientId },
    })

    if (inviteErr) {
      // אם משתמש כבר קיים — בכל זאת נוסיף לארגון
      if (!inviteErr.message?.toLowerCase().includes('already registered')) {
        logger.error('invite-worker', 'invite failed', new Error(inviteErr.message))
        return NextResponse.json({ error: `שגיאה בשליחת הזמנה: ${inviteErr.message}`, requestId }, { status: 500 })
      }
    }

    // מצא את ה-user_id (קיים או חדש)
    const userId = inviteData?.user?.id ?? null

    if (userId) {
      const { error: ouErr } = await supabase
        .from('organization_users')
        .upsert(
          { organization_id: orgId, user_id: userId, role },
          { onConflict: 'organization_id,user_id' }
        )

      if (ouErr) {
        logger.error('invite-worker', 'organization_users upsert failed', new Error(ouErr.message))
        return NextResponse.json({ error: `שגיאה בהוספה לארגון: ${ouErr.message}`, requestId }, { status: 500 })
      }
    }

    audit.logAction('CREATE', 'ORGANIZATION_USERS', orgId, clientId, undefined, undefined, 'SUCCESS', `invited ${email} as ${role}`)

    return NextResponse.json({ ok: true, email, role, user_id: userId, requestId })
  } catch (err) {
    logger.error('invite-worker', 'unexpected error', err instanceof Error ? err : new Error(String(err)))
    return NextResponse.json({ error: 'שגיאה פנימית', requestId }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const requestId = `list-org-users-${Date.now()}`
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const clientId = auth.ctx.clientId

    const { data: orgRows, error: orgErr } = await supabase
      .from('organizations')
      .select('id')
      .eq('client_id', clientId)
      .limit(1)

    if (orgErr || !orgRows?.length) {
      return NextResponse.json({ users: [] })
    }
    const orgId = orgRows[0].id

    const { data: ouRows, error: ouErr } = await supabase
      .from('organization_users')
      .select('id, user_id, role, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })

    if (ouErr) {
      return NextResponse.json({ error: ouErr.message, requestId }, { status: 500 })
    }

    // שלוף אימיילים מ-auth.users
    const userIds = (ouRows ?? []).map((r) => r.user_id)
    const emailMap: Record<string, string> = {}
    for (const uid of userIds) {
      const { data: u } = await supabase.auth.admin.getUserById(uid)
      if (u?.user?.email) emailMap[uid] = u.user.email
    }

    const users = (ouRows ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      email: emailMap[r.user_id] ?? '—',
      role: r.role,
      created_at: r.created_at,
    }))

    return NextResponse.json({ users, org_role: auth.ctx.role })
  } catch (err) {
    return NextResponse.json({ error: 'שגיאה פנימית', requestId }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const requestId = `remove-org-user-${Date.now()}`
  try {
    const auth = await requireSessionMinRole('admin')
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(req.url)
    const ouId = searchParams.get('id')
    if (!ouId) return NextResponse.json({ error: 'חסר id', requestId }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const clientId = auth.ctx.clientId

    // וודא שה-organization_user שייך לאותו לקוח
    const { data: orgRows } = await supabase
      .from('organizations')
      .select('id')
      .eq('client_id', clientId)
      .limit(1)

    const orgId = orgRows?.[0]?.id
    if (!orgId) return NextResponse.json({ error: 'ארגון לא נמצא', requestId }, { status: 404 })

    // Prevent removing yourself
    const { data: target } = await supabase
      .from('organization_users')
      .select('user_id')
      .eq('id', ouId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (target && (target as { user_id: string }).user_id === auth.ctx.userId) {
      return NextResponse.json({ error: 'לא ניתן להסיר את עצמך מהארגון', requestId }, { status: 400 })
    }

    const { error } = await supabase
      .from('organization_users')
      .delete()
      .eq('id', ouId)
      .eq('organization_id', orgId)

    if (error) return NextResponse.json({ error: error.message, requestId }, { status: 500 })

    return NextResponse.json({ ok: true, requestId })
  } catch (err) {
    return NextResponse.json({ error: 'שגיאה פנימית', requestId }, { status: 500 })
  }
}
