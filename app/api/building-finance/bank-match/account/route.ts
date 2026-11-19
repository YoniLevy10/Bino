import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { formatZodError } from '@/lib/errors/format-zod-error'
import { buildingBankAccountUpsertBodySchema } from '@/lib/api-body-schemas'
import { isBankMatchPocEnabled } from '@/lib/bank-match/flags'
import { buildIsraeliBban } from '@/lib/bank-match/bban'

export const dynamic = 'force-dynamic'

const SAFE_SELECT = `
  id, client_id, project_id, display_name, bank_code, branch_number, account_number,
  iban, bban, provider, ingest_source, connection_status, sync_enabled, sync_day_of_month,
  last_sync_at, last_sync_error, last_import_at, is_active, created_at, updated_at
`.replace(/\s+/g, ' ').trim()

export async function GET(req: Request) {
  if (!isBankMatchPocEnabled()) {
    return NextResponse.json({ error: 'מודול התאמות בנק כבוי', code: 'BANK_MATCH_DISABLED' }, { status: 503 })
  }
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const projectId = new URL(req.url).searchParams.get('project_id') || ''
  if (!projectId) {
    return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('building_bank_accounts')
    .select(SAFE_SELECT)
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    account: data,
    flags: {
      bank_match_poc: true,
      scraper_sync: false,
      file_import_only: true,
    },
  })
}

export async function POST(req: Request) {
  if (!isBankMatchPocEnabled()) {
    return NextResponse.json({ error: 'מודול התאמות בנק כבוי', code: 'BANK_MATCH_DISABLED' }, { status: 503 })
  }
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-bank-account-upsert'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = buildingBankAccountUpsertBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  if (
    body.scraper_credentials &&
    Object.values(body.scraper_credentials).some((v) => String(v || '').trim())
  ) {
    return NextResponse.json(
      {
        error: 'משיכה חיה מהבנק בוטלה. שמרו פרטי חשבון בלבד וייבאו קובץ בנק.',
        code: 'SCRAPER_REMOVED',
      },
      { status: 410 }
    )
  }
  if (body.ingest_source === 'scraper') {
    return NextResponse.json(
      {
        error: 'משיכה חיה מהבנק בוטלה. ingest_source חייב להיות csv.',
        code: 'SCRAPER_REMOVED',
      },
      { status: 410 }
    )
  }

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', body.project_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()
  if (!project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  const bban =
    body.bank_code && body.branch_number && body.account_number
      ? buildIsraeliBban({
          bankCode: body.bank_code,
          branchNumber: body.branch_number,
          accountNumber: body.account_number,
        })
      : null

  const row: Record<string, unknown> = {
    client_id: auth.ctx.clientId,
    project_id: body.project_id,
    display_name: body.display_name ?? null,
    bank_code: body.bank_code ?? null,
    branch_number: body.branch_number ?? null,
    account_number: body.account_number ?? null,
    iban: body.iban ?? null,
    bban,
    provider: body.provider?.trim() || null,
    ingest_source: 'csv',
    connection_status: 'ready_for_import',
    sync_enabled: body.sync_enabled ?? false,
    sync_day_of_month: body.sync_day_of_month ?? null,
    is_active: true,
    updated_at: new Date().toISOString(),
    // Clear any previously stored scraper secrets
    scraper_credentials_enc: null,
  }

  const { data: existing } = await admin
    .from('building_bank_accounts')
    .select('id')
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', body.project_id)
    .eq('is_active', true)
    .maybeSingle()

  let saved
  if (existing?.id) {
    const { data, error } = await admin
      .from('building_bank_accounts')
      .update(row)
      .eq('id', existing.id)
      .select(SAFE_SELECT)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    saved = data
  } else {
    const { data, error } = await admin
      .from('building_bank_accounts')
      .insert(row)
      .select(SAFE_SELECT)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    saved = data
  }

  return NextResponse.json({ account: saved })
}
