import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'
import { inviteUserToClientOrganization } from '@/lib/invite-organization-user'
import { ensureOrganizationUserWithPassword } from '@/lib/ensure-organization-user-password'

const bodySchema = z
  .object({
    email: z.string().email(),
    role: z.enum(['admin', 'manager', 'viewer']).default('admin'),
    mode: z.enum(['invite', 'password']).default('invite'),
    password: z.string().optional(),
    fullName: z.string().max(120).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'password' && (!val.password || val.password.length < 8)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'הסיסמה חייבת להיות באורך 8 תווים לפחות',
      })
    }
  })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const { id: clientId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message || 'Invalid body'
    return NextResponse.json({ error: first, details: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: clientRow } = await admin.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!clientRow) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  if (parsed.data.mode === 'password') {
    const result = await ensureOrganizationUserWithPassword(admin, {
      clientId,
      email: parsed.data.email,
      password: parsed.data.password!,
      role: parsed.data.role,
      fullName: parsed.data.fullName,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json({ ...result, mode: 'password' })
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')

  const result = await inviteUserToClientOrganization(admin, {
    clientId,
    email: parsed.data.email,
    role: parsed.data.role,
    appUrl,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ...result, mode: 'invite' })
}
