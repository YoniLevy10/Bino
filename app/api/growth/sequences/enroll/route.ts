import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { evaluateEnrollmentStop } from '@/lib/growth/outreach/stop-rules'
import { personalizeTemplate } from '@/lib/growth/outreach/sequences'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { z } from 'zod'

const bodySchema = z.object({
  sequenceId: z.string().uuid(),
  leadId: z.string().uuid(),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'growth-enroll'
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
    .select(
      '*, growth_companies(name, city, email_public, phone), growth_contacts(full_name, email, phone)'
    )
    .eq('id', parsed.data.leadId)
    .eq('organization_id', auth.ctx.organizationId)
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: 'ליד לא נמצא' }, { status: 404 })

  const email =
    (lead.growth_contacts as { email?: string | null } | null)?.email ||
    (lead.growth_companies as { email_public?: string | null } | null)?.email_public ||
    null
  const phone =
    (lead.growth_contacts as { phone?: string | null } | null)?.phone ||
    (lead.growth_companies as { phone?: string | null } | null)?.phone ||
    null

  if (email) {
    const { data: suppressed } = await auth.ctx.admin
      .from('growth_suppressions')
      .select('id')
      .eq('organization_id', auth.ctx.organizationId)
      .eq('email', email)
      .maybeSingle()
    if (suppressed) {
      return NextResponse.json({ error: 'איש קשר ברשימת דיכוי / opt-out' }, { status: 403 })
    }
  }
  if (phone) {
    const { data: suppressedPhone } = await auth.ctx.admin
      .from('growth_suppressions')
      .select('id')
      .eq('organization_id', auth.ctx.organizationId)
      .eq('phone', phone)
      .maybeSingle()
    if (suppressedPhone) {
      return NextResponse.json({ error: 'איש קשר ברשימת דיכוי / opt-out' }, { status: 403 })
    }
  }

  const { data: sequence } = await auth.ctx.admin
    .from('growth_sequences')
    .select('*')
    .eq('id', parsed.data.sequenceId)
    .eq('organization_id', auth.ctx.organizationId)
    .maybeSingle()
  if (!sequence) return NextResponse.json({ error: 'רצף לא נמצא' }, { status: 404 })

  const stop = evaluateEnrollmentStop({
    leadStatus: lead.status,
    optedOut: lead.status === 'suppressed',
    markedInvalid: lead.status === 'disqualified',
    replied: lead.status === 'replied',
    demoBooked: lead.status === 'demo_booked' || lead.status === 'customer',
    stopOnReply: sequence.stop_on_reply,
    stopOnOptOut: sequence.stop_on_opt_out,
    stopOnDemoBooked: sequence.stop_on_demo_booked,
  })
  if (stop.stop) {
    return NextResponse.json({ error: `לא ניתן לרשום: ${stop.reason}` }, { status: 409 })
  }

  const { data: enrollment, error } = await auth.ctx.admin
    .from('growth_sequence_enrollments')
    .insert({
      organization_id: auth.ctx.organizationId,
      sequence_id: sequence.id,
      lead_id: lead.id,
      status: 'active',
      current_step: 0,
      next_run_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'הליד כבר רשום לרצף זה' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: step0 } = await auth.ctx.admin
    .from('growth_sequence_steps')
    .select('*')
    .eq('sequence_id', sequence.id)
    .eq('step_order', 0)
    .maybeSingle()

  let draft = null
  if (step0) {
    const company = lead.growth_companies as { name?: string; city?: string | null } | null
    const contact = lead.growth_contacts as { full_name?: string | null } | null
    const bodyText = personalizeTemplate(step0.body_template, {
      companyName: company?.name || 'החברה',
      city: company?.city,
      contactName: contact?.full_name,
    })
    const subject = step0.subject_template
      ? personalizeTemplate(step0.subject_template, {
          companyName: company?.name || 'החברה',
          city: company?.city,
          contactName: contact?.full_name,
        })
      : null

    const { data: interaction } = await auth.ctx.admin
      .from('growth_interactions')
      .insert({
        organization_id: auth.ctx.organizationId,
        lead_id: lead.id,
        enrollment_id: enrollment.id,
        channel: sequence.channel,
        direction: 'outbound',
        kind: sequence.channel === 'email' ? 'email' : 'message',
        subject,
        body: bodyText,
        status: 'draft',
        payload: { stepOrder: 0, requiresManualSend: true },
      })
      .select('*')
      .single()
    draft = interaction
  }

  await auth.ctx.admin
    .from('growth_leads')
    .update({
      status: lead.status === 'new' || lead.status === 'researched' || lead.status === 'qualified'
        ? 'contacted'
        : lead.status,
      last_touched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id)

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'growth.sequence.enroll',
    entityType: 'growth_enrollment',
    entityId: enrollment.id,
    after: { leadId: lead.id, sequenceId: sequence.id },
  })

  return NextResponse.json(
    {
      enrollment,
      draftInteraction: draft,
      noteHe: 'נוצרה טיוטת פנייה — שליחה אוטומטית המונית כבויה. אשר/שלח ידנית.',
    },
    { status: 201 }
  )
}
