import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { isWhatsAppInboxV2Enabled } from '@/lib/whatsapp-inbox-v2-flag'
import { whatsappResidentsSearchQuerySchema } from '@/lib/whatsapp-api-schemas'
import { normalizePhone } from '@/lib/residents-whatsapp'

export async function GET(req: NextRequest) {
  if (!isWhatsAppInboxV2Enabled()) {
    return NextResponse.json({ error: 'לא זמין' }, { status: 404 })
  }

  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const parsed = whatsappResidentsSearchQuerySchema.safeParse({
    q: req.nextUrl.searchParams.get('q') ?? undefined,
    building_id: req.nextUrl.searchParams.get('building_id') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const q = parsed.data.q?.trim() ?? ''
  const limit = parsed.data.limit ?? 25
  const admin = getSupabaseAdmin()

  let query = admin
    .from('residents')
    .select('id, full_name, apartment_number, phone, normalized_phone, project_id, projects(name)')
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .not('phone', 'is', null)
    .order('full_name', { ascending: true })
    .limit(limit)

  if (parsed.data.building_id) {
    query = query.eq('project_id', parsed.data.building_id)
  }

  if (q.length >= 2) {
    const digits = q.replace(/\D/g, '')
    if (digits.length >= 4) {
      const phoneKey = normalizePhone(digits.startsWith('972') ? digits : `0${digits}`)
      query = query.or(
        `full_name.ilike.%${q}%,apartment_number.ilike.%${q}%,normalized_phone.ilike.%${phoneKey}%`
      )
    } else {
      query = query.or(`full_name.ilike.%${q}%,apartment_number.ilike.%${q}%`)
    }
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const residents = (data ?? []).map((row) => {
    const r = row as {
      id: string
      full_name: string
      apartment_number?: string | null
      phone?: string | null
      normalized_phone?: string | null
      project_id?: string | null
      projects?: { name?: string } | { name?: string }[] | null
    }
    const projects = r.projects
    const building =
      Array.isArray(projects) ? projects[0]?.name : (projects as { name?: string } | undefined)?.name
    return {
      id: r.id,
      full_name: r.full_name,
      apartment_number: r.apartment_number ?? null,
      phone: r.normalized_phone || normalizePhone(r.phone || ''),
      building_name: building?.trim() || null,
      project_id: r.project_id ?? null,
    }
  })

  return NextResponse.json({ residents })
}