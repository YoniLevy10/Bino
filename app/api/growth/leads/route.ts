import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { scoreGrowthLead } from '@/lib/growth/scoring'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'
import { z } from 'zod'

export async function GET(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const band = new URL(req.url).searchParams.get('band')
  let q = auth.ctx.admin
    .from('growth_leads')
    .select(
      '*, growth_companies(name, website, city, phone, category), growth_contacts(full_name, role, email, phone)'
    )
    .eq('organization_id', auth.ctx.organizationId)
    .order('score', { ascending: false })

  if (band === 'hot' || band === 'warm' || band === 'cold') {
    q = q.eq('score_band', band)
  }

  const { data, error } = await q.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data ?? [] })
}

const createSchema = z.object({
  companyName: z.string().min(1),
  website: z.string().url().optional().nullable(),
  city: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  emailPublic: z.string().email().optional().nullable(),
  category: z.string().optional().nullable(),
  buildingsCountEst: z.number().int().positive().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactRole: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  signals: z
    .object({
      managesMultipleBuildings: z.boolean().optional(),
      relevantPmcCategory: z.boolean().optional(),
      operationalContactFound: z.boolean().optional(),
      activeWebsite: z.boolean().optional(),
      visibleMaintenanceOps: z.boolean().optional(),
      whatsappOrPublicContact: z.boolean().optional(),
      geographicFitIsrael: z.boolean().optional(),
    })
    .default({}),
  source: z.string().default('manual'),
  sourceUrl: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'growth-leads')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין', details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const scored = scoreGrowthLead({
    ...d.signals,
    buildingsCountEst: d.buildingsCountEst,
    relevantPmcCategory: d.signals.relevantPmcCategory ?? Boolean(d.category),
    activeWebsite: d.signals.activeWebsite ?? Boolean(d.website),
    whatsappOrPublicContact:
      d.signals.whatsappOrPublicContact ?? Boolean(d.phone || d.emailPublic || d.contactPhone),
    operationalContactFound:
      d.signals.operationalContactFound ?? Boolean(d.contactName || d.contactRole),
    geographicFitIsrael: d.signals.geographicFitIsrael ?? true,
  })

  const { data: company, error: cErr } = await auth.ctx.admin
    .from('growth_companies')
    .insert({
      organization_id: auth.ctx.organizationId,
      name: d.companyName,
      website: d.website ?? null,
      city: d.city ?? null,
      phone: d.phone ?? null,
      email_public: d.emailPublic ?? null,
      category: d.category ?? null,
      buildings_count_est: d.buildingsCountEst ?? null,
      source: d.source,
      source_url: d.sourceUrl ?? null,
      confidence: 0.6,
    })
    .select('*')
    .single()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  let contactId: string | null = null
  if (d.contactName || d.contactEmail || d.contactPhone) {
    const { data: contact, error: ctErr } = await auth.ctx.admin
      .from('growth_contacts')
      .insert({
        organization_id: auth.ctx.organizationId,
        company_id: company.id,
        full_name: d.contactName ?? null,
        role: d.contactRole ?? null,
        email: d.contactEmail ?? null,
        phone: d.contactPhone ?? null,
        source: d.source,
      })
      .select('id')
      .single()
    if (ctErr) return NextResponse.json({ error: ctErr.message }, { status: 500 })
    contactId = contact.id
  }

  const { data: lead, error: lErr } = await auth.ctx.admin
    .from('growth_leads')
    .insert({
      organization_id: auth.ctx.organizationId,
      brand_id: BAMAKOR_BRAND_ID,
      company_id: company.id,
      contact_id: contactId,
      status: scored.band === 'hot' || scored.band === 'warm' ? 'qualified' : 'researched',
      score: scored.score,
      score_band: scored.band,
      score_reasons: scored.reasons,
      notes: d.notes ?? null,
    })
    .select('*')
    .single()
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'growth.lead.create',
    entityType: 'growth_lead',
    entityId: lead.id,
    after: { score: scored.score, band: scored.band },
  })

  return NextResponse.json({ lead, company, score: scored }, { status: 201 })
}
