import { NextRequest, NextResponse } from 'next/server'
import {
  isSuperAdminRequest,
  superAdminUnauthorizedResponse,
} from '@/lib/superadmin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { updateLeadStatus } from '@/lib/sales-leads/service'
import { LEAD_STATUSES, type LeadStatus } from '@/lib/sales-leads/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()
  const { id } = await ctx.params

  let body: { status?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!body.status || !(LEAD_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  try {
    const admin = getSupabaseAdmin()
    const lead = await updateLeadStatus(admin, id, body.status as LeadStatus)
    return NextResponse.json({ lead })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'update failed' },
      { status: 500 },
    )
  }
}
