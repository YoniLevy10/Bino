import { NextRequest, NextResponse } from 'next/server'
import {
  isSuperAdminRequest,
  superAdminUnauthorizedResponse,
} from '@/lib/superadmin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  deleteSalesLead,
  markLeadWhatsappOpened,
  updateLeadFields,
  updateLeadStatus,
} from '@/lib/sales-leads/service'
import { LEAD_STATUSES, type LeadStatus } from '@/lib/sales-leads/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()
  const { id } = await ctx.params

  let body: {
    status?: string
    action?: string
    nextContactAt?: string | null
    estimatedBuildings?: number | null
    notes?: string | null
    outreachVariant?: string | null
  } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  try {
    const admin = getSupabaseAdmin()

    if (body.action === 'whatsapp_opened') {
      const lead = await markLeadWhatsappOpened(admin, id)
      if (body.outreachVariant) {
        await updateLeadFields(admin, id, { outreachVariant: body.outreachVariant })
      }
      return NextResponse.json({ lead })
    }

    const hasFieldPatch =
      body.nextContactAt !== undefined ||
      body.estimatedBuildings !== undefined ||
      body.notes !== undefined ||
      Boolean(body.outreachVariant)

    if (body.status && !(LEAD_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }

    if (!body.status && !hasFieldPatch) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }

    if (hasFieldPatch || body.status) {
      const lead = await updateLeadFields(admin, id, {
        status: body.status as LeadStatus | undefined,
        nextContactAt: body.nextContactAt,
        estimatedBuildings: body.estimatedBuildings,
        notes: body.notes,
        outreachVariant: body.outreachVariant,
      })
      return NextResponse.json({ lead })
    }

    const lead = await updateLeadStatus(admin, id, body.status as LeadStatus)
    return NextResponse.json({ lead })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'update failed' },
      { status: 500 },
    )
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!isSuperAdminRequest(_req)) return superAdminUnauthorizedResponse()
  const { id } = await ctx.params

  try {
    const admin = getSupabaseAdmin()
    await deleteSalesLead(admin, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'delete failed' },
      { status: 500 },
    )
  }
}
