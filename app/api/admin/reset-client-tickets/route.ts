import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/superadmin-auth'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'


const bodySchema = z.object({
  client_id: z.string().uuid(),
})

export async function POST(req: Request) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

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
  const { data, error } = await admin.rpc('bamakor_reset_client_tickets', {
    p_client_id: parsed.data.client_id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, result: data })
}
