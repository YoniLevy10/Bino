import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { inviteUserToClientOrganization } from '@/lib/invite-organization-user'
import { ensureOrganizationUserWithPassword } from '@/lib/ensure-organization-user-password'
import { z } from 'zod'

const inviteWorkerSchema = z
  .object({
    email: z.string().email(),
    role: z.enum(['admin', 'manager', 'viewer']).default('viewer'),
    mode: z.enum(['invite', 'password']).default('invite'),
    password: z.string().optional(),
    fullName: z.string().max(120).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'password') {
      if (!val.password || val.password.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: 'הסיסמה חייבת להיות באורך 8 תווים לפחות',
        })
      }
    }
  })

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `invite-worker-${Date.now()}`

  try {
    const auth = await requireSessionWriteAccess()
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
      const first =
        parsed.error.issues[0]?.message ||
        'נתונים לא תקינים'
      return NextResponse.json({ error: first, details: parsed.error.flatten(), requestId }, { status: 400 })
    }
    const { email, role, mode, password, fullName } = parsed.data
    const clientId = auth.ctx.clientId

    if (mode === 'password') {
      const result = await ensureOrganizationUserWithPassword(supabase, {
        clientId,
        email,
        password: password!,
        role,
        fullName,
      })
      if (!result.ok) {
        logger.error('invite-worker', 'password user failed', new Error(result.error))
        return NextResponse.json({ error: result.error, requestId }, { status: 500 })
      }
      audit.logAction(
        'CREATE',
        'ORGANIZATION_USERS',
        result.userId,
        clientId,
        undefined,
        undefined,
        'SUCCESS',
        `${result.created ? 'created' : 'updated'} password user ${result.email} as ${role}`
      )
      return NextResponse.json({
        ok: true,
        mode: 'password',
        email: result.email,
        role: result.role,
        user_id: result.userId,
        created: result.created,
        requestId,
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || ''
    const result = await inviteUserToClientOrganization(supabase, {
      clientId,
      email,
      role,
      appUrl,
    })

    if (!result.ok) {
      logger.error('invite-worker', 'invite failed', new Error(result.error))
      return NextResponse.json({ error: `שגיאה בשליחת הזמנה: ${result.error}`, requestId }, { status: 500 })
    }

    audit.logAction(
      'CREATE',
      'ORGANIZATION_USERS',
      result.userId,
      clientId,
      undefined,
      undefined,
      'SUCCESS',
      `invited ${result.email} as ${role}`
    )

    return NextResponse.json({
      ok: true,
      mode: 'invite',
      email: result.email,
      role: result.role,
      user_id: result.userId,
      requestId,
    })
  } catch (err) {
    logger.error('invite-worker', 'unexpected error', err instanceof Error ? err : new Error(String(err)))
    return NextResponse.json({ error: 'שגיאה פנימית', requestId }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const requestId = `list-org-users-${Date.now()}`
  try {
    const auth = await requireSessionWriteAccess()
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

    return NextResponse.json({ users })
  } catch {
    return NextResponse.json({ error: 'שגיאה פנימית', requestId }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const requestId = `remove-org-user-${Date.now()}`
  try {
    const auth = await requireSessionWriteAccess()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(req.url)
    const ouId = searchParams.get('id')
    if (!ouId) return NextResponse.json({ error: 'חסר id', requestId }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const clientId = auth.ctx.clientId

    const { data: orgRows } = await supabase
      .from('organizations')
      .select('id')
      .eq('client_id', clientId)
      .limit(1)

    const orgId = orgRows?.[0]?.id
    if (!orgId) return NextResponse.json({ error: 'ארגון לא נמצא', requestId }, { status: 404 })

    const { error } = await supabase
      .from('organization_users')
      .delete()
      .eq('id', ouId)
      .eq('organization_id', orgId)

    if (error) return NextResponse.json({ error: error.message, requestId }, { status: 500 })

    return NextResponse.json({ ok: true, requestId })
  } catch {
    return NextResponse.json({ error: 'שגיאה פנימית', requestId }, { status: 500 })
  }
}
