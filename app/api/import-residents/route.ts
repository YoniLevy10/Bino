import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeString } from '@/lib/api-validation'
import { importResidentsBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientId } from '@/lib/api-auth'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { normalizeOwnershipType, parseOwnershipPercent } from '@/lib/resident-ownership'

type ImportRow = {
  full_name?: unknown
  phone?: unknown
  apartment_number?: unknown
  notes?: unknown
  project_code?: unknown
  project_name?: unknown
  ownership_type?: unknown
  ownership_percent?: unknown
}

function normalizeString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
}

function normalizeProjectCode(v: unknown): string {
  return normalizeString(v).toUpperCase()
}

function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('972')) return `+${digits}`
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) return `+972${digits}`
  return `+${digits}`
}

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `import-residents-${Date.now()}`

  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    const bamakorClientId = auth.ctx.clientId
    const supabase = getSupabaseAdmin()

    const rl = await checkAuthenticatedPostRouteLimit(supabase, auth.ctx.userId, 'import-residents')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json()
    const validated = importResidentsBodySchema.safeParse(rawBody)

    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const rows = validated.data.rows as ImportRow[]
    const dryRun = !!validated.data.dryRun

    const { data: projects, error: pErr } = await supabase
      .from('projects')
      .select('id, name, project_code, client_id')
      .eq('client_id', bamakorClientId)
      .order('name')

    if (pErr) {
      logger.error('RESIDENTS_API', 'Load projects failed', new Error(pErr.message), {
        requestId,
        clientId: bamakorClientId,
      })

      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    const byCode = new Map<string, { id: string; name: string }>()
    const byName = new Map<string, { id: string; name: string }>()

    ;(projects as { id: string; name: string; project_code: string }[] | null)?.forEach((p) => {
      byCode.set((p.project_code || '').toUpperCase(), { id: p.id, name: p.name })
      byName.set((p.name || '').trim().toLowerCase(), { id: p.id, name: p.name })
    })

    const toInsert: {
      project_id: string
      client_id: string
      full_name: string
      phone: string | null
      apartment_number: string | null
      ownership_type: string | null
      ownership_percent: number | null
      notes: string | null
    }[] = []

    const errors: { rowIndex: number; error: string; severity: 'error' | 'warning' }[] = []

    rows.forEach((r, idx) => {
      const fullName =
        sanitizeString(r.full_name) ||
        normalizeString(r.full_name) ||
        normalizeString(r.phone) ||
        'דייר ללא שם'

      const projectCode = normalizeProjectCode(r.project_code)
      const projectName = normalizeString(r.project_name).toLowerCase()

      const match =
        (projectCode && byCode.get(projectCode)) ||
        (projectName && byName.get(projectName)) ||
        null

      if (!match) {
        errors.push({
          rowIndex: idx,
          error: 'לא נמצא בניין תואם (project_code / project_name)',
          severity: 'error',
        })
        return
      }

      const normalizedPhone = normalizePhone(r.phone)

      if (normalizedPhone && normalizedPhone.length < 12) {
        errors.push({
          rowIndex: idx,
          error: 'מספר טלפון לא תקין',
          severity: 'warning',
        })
      }

      toInsert.push({
        project_id: match.id,
        client_id: bamakorClientId,
        full_name: fullName,
        phone: normalizedPhone || null,
        apartment_number: normalizeString(r.apartment_number) || null,
        ownership_type: normalizeOwnershipType(r.ownership_type),
        ownership_percent: parseOwnershipPercent(r.ownership_percent),
        notes: sanitizeString(r.notes) || normalizeString(r.notes) || null,
      })
    })

    const projectIds = [...new Set(toInsert.map((r) => r.project_id))]

    const { data: existingRows } = await supabase
      .from('residents')
      .select('project_id, phone')
      .eq('client_id', bamakorClientId)
      .in('project_id', projectIds)
      .is('deleted_at', null)

    const existingKeys = new Set(
      ((existingRows ?? []) as { project_id: string; phone: string | null }[])
        .filter((r) => r.phone)
        .map((r) => `${r.project_id}:${r.phone}`)
    )

    const deduped: typeof toInsert = []
    let skipped = 0

    for (const row of toInsert) {
      const key = row.phone ? `${row.project_id}:${row.phone}` : null

      if (key && existingKeys.has(key)) {
        skipped++
        errors.push({
          rowIndex: skipped,
          error: 'דייר כפול — כבר קיים בבניין',
          severity: 'warning',
        })
        continue
      }

      if (key) existingKeys.add(key)
      deduped.push(row)
    }

    const summary = {
      totalRows: rows.length,
      validRows: deduped.length,
      skipped,
      failed: errors.filter((e) => e.severity === 'error').length,
      warnings: errors.filter((e) => e.severity === 'warning').length,
      dryRun,
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        summary,
        errors,
        preview: deduped.slice(0, 20),
        requestId,
      })
    }

    if (deduped.length === 0) {
      return NextResponse.json({
        inserted: 0,
        summary,
        errors,
        requestId,
      })
    }

    const { data: insertedRows, error: insErr } = await supabase
      .from('residents')
      .insert(deduped)
      .select(
        'id, project_id, client_id, full_name, phone, apartment_number, ownership_type, ownership_percent, notes'
      )

    if (insErr) {
      logger.error('RESIDENTS_API', 'Bulk insert residents failed', new Error(insErr.message), {
        requestId,
        clientId: bamakorClientId,
      })

      audit.logFailedOperation('IMPORT', 'RESIDENTS', 'bulk', bamakorClientId, insErr.message)

      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    return NextResponse.json({
      inserted: (insertedRows as unknown[] | null)?.length ?? deduped.length,
      summary,
      errors,
      residents: insertedRows,
      requestId,
    })
  } catch (e) {
    console.error('[import-residents]', e)

    logger.error(
      'RESIDENTS_API',
      'Unhandled import-residents error',
      e instanceof Error ? e : new Error(String(e)),
      { requestId }
    )

    return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
  }
}
