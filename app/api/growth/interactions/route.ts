import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { evaluateEnrollmentStop } from '@/lib/growth/outreach/stop-rules'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { z } from 'zod'

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark_replied'),
    leadId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('opt_out'),
    leadId: z.string().uuid(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    reason: z.string().default('opt_out'),
  }),
  z.object({
    action: z.literal('demo_booked'),
    leadId: z.string().uuid(),
  }),
])

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'growth-interactions'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const { data: lead } = await auth.ctx.admin
    .from('growth_leads')
    .select('*')
    .eq('id', parsed.data.leadId)
    .eq('organization_id', auth.ctx.organizationId)
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: 'ליד לא נמצא' }, { status: 404 })

  if (parsed.data.action === 'opt_out') {
    await auth.ctx.admin.from('growth_suppressions').insert({
      organization_id: auth.ctx.organizationId,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      company_id: lead.company_id,
      reason: parsed.data.reason,
    })
    await auth.ctx.admin
      .from('growth_leads')
      .update({ status: 'suppressed', updated_at: new Date().toISOString() })
      .eq('id', lead.id)

    const { data: enrollments } = await auth.ctx.admin
      .from('growth_sequence_enrollments')
      .select('*, growth_sequences(stop_on_opt_out, stop_on_reply, stop_on_demo_booked)')
      .eq('lead_id', lead.id)
      .eq('status', 'active')

    for (const en of enrollments ?? []) {
      const seq = en.growth_sequences as {
        stop_on_opt_out: boolean
        stop_on_reply: boolean
        stop_on_demo_booked: boolean
      } | null
      const stop = evaluateEnrollmentStop({
        leadStatus: 'suppressed',
        optedOut: true,
        markedInvalid: false,
        replied: false,
        demoBooked: false,
        stopOnReply: seq?.stop_on_reply ?? true,
        stopOnOptOut: seq?.stop_on_opt_out ?? true,
        stopOnDemoBooked: seq?.stop_on_demo_booked ?? true,
      })
      if (stop.stop) {
        await auth.ctx.admin
          .from('growth_sequence_enrollments')
          .update({
            status: stop.status,
            stop_reason: stop.reason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', en.id)
      }
    }

    await auth.ctx.admin.from('growth_interactions').insert({
      organization_id: auth.ctx.organizationId,
      lead_id: lead.id,
      channel: 'system',
      direction: 'inbound',
      kind: 'opt_out',
      body: parsed.data.reason,
      status: 'received',
    })

    await writeMbrainAudit(auth.ctx.admin, {
      organizationId: auth.ctx.organizationId,
      actorUserId: auth.ctx.userId,
      action: 'growth.opt_out',
      entityType: 'growth_lead',
      entityId: lead.id,
    })

    return NextResponse.json({ ok: true, status: 'suppressed' })
  }

  if (parsed.data.action === 'mark_replied') {
    await auth.ctx.admin
      .from('growth_leads')
      .update({ status: 'replied', updated_at: new Date().toISOString() })
      .eq('id', lead.id)

    await auth.ctx.admin
      .from('growth_sequence_enrollments')
      .update({
        status: 'stopped_reply',
        stop_reason: 'התקבלה תשובה',
        updated_at: new Date().toISOString(),
      })
      .eq('lead_id', lead.id)
      .eq('status', 'active')

    await auth.ctx.admin.from('growth_interactions').insert({
      organization_id: auth.ctx.organizationId,
      lead_id: lead.id,
      channel: 'system',
      direction: 'inbound',
      kind: 'message',
      body: 'marked replied — sequences stopped',
      status: 'received',
    })

    return NextResponse.json({ ok: true, status: 'replied' })
  }

  // demo_booked
  await auth.ctx.admin
    .from('growth_leads')
    .update({ status: 'demo_booked', updated_at: new Date().toISOString() })
    .eq('id', lead.id)

  await auth.ctx.admin
    .from('growth_sequence_enrollments')
    .update({
      status: 'stopped_demo',
      stop_reason: 'נקבע דמו',
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', lead.id)
    .eq('status', 'active')

  await auth.ctx.admin.from('growth_conversions').insert({
    organization_id: auth.ctx.organizationId,
    brand_id: lead.brand_id,
    lead_id: lead.id,
    event_type: 'demo_booked',
    channel: 'outbound',
  })

  await auth.ctx.admin.from('growth_interactions').insert({
    organization_id: auth.ctx.organizationId,
    lead_id: lead.id,
    channel: 'system',
    direction: 'system',
    kind: 'demo',
    body: 'demo booked',
    status: 'received',
  })

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'growth.demo_booked',
    entityType: 'growth_lead',
    entityId: lead.id,
  })

  return NextResponse.json({ ok: true, status: 'demo_booked' })
}
