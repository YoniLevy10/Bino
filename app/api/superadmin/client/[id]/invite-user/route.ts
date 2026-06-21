import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'
import { inviteUserToClientOrganization } from '@/lib/invite-organization-user'

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'viewer']).default('admin'),
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: clientRow } = await admin.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!clientRow) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    'https://bamakor.vercel.app'

  const result = await inviteUserToClientOrganization(admin, {
    clientId,
    email: parsed.data.email,
    role: parsed.data.role,
    appUrl,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json(result)
}
