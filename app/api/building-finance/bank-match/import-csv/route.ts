import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { formatZodError } from '@/lib/format-zod-error'
import { bankMatchImportCsvBodySchema } from '@/lib/api-body-schemas'
import { isBankMatchPocEnabled } from '@/lib/bank-match/flags'
import { parseBankDocument } from '@/lib/bank-match/document-parse'
import { ingestNormalizedTransactions } from '@/lib/bank-match/ingest'
import { runMatchPassForProject } from '@/lib/bank-match/run-match-pass'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
    'bank-match-import-csv'
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
  const parsed = bankMatchImportCsvBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }

  const { project_id, csv_text, file_base64, file_name, mime_type, run_match } = parsed.data
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()
  if (!project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  let bytes: Buffer | null = null
  if (file_base64?.trim()) {
    try {
      const cleaned = file_base64.replace(/^data:[^;]+;base64,/, '')
      bytes = Buffer.from(cleaned, 'base64')
      if (bytes.byteLength > 8 * 1024 * 1024) {
        return NextResponse.json({ error: 'קובץ גדול מדי (מקסימום 8MB)' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'קובץ base64 לא תקין' }, { status: 400 })
    }
  }

  const doc = await parseBankDocument({
    projectId: project_id,
    fileName: file_name,
    mimeType: mime_type,
    bytes,
    csvText: csv_text,
  })

  if (doc.rows.length === 0) {
    return NextResponse.json(
      { error: 'לא נמצאו תנועות במסמך', parse_errors: doc.errors, format: doc.format },
      { status: 400 }
    )
  }

  const ingest = await ingestNormalizedTransactions({
    admin,
    clientId: auth.ctx.clientId,
    projectId: project_id,
    rows: doc.rows,
  })

  let matchResult = null
  if (run_match !== false) {
    matchResult = await runMatchPassForProject({
      admin,
      clientId: auth.ctx.clientId,
      projectId: project_id,
      applyAuto: true,
      actorUserId: auth.ctx.userId,
    })
  }

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: 'bank_match.import_document',
    entityType: 'project',
    entityId: project_id,
    newValues: {
      format: doc.format,
      file_name: file_name || null,
      rows: doc.rows.length,
      upserted: ingest.upserted,
      auto: matchResult?.autoApplied,
    },
  })

  return NextResponse.json({
    ok: true,
    format: doc.format,
    parsed: doc.rows.length,
    ingest,
    parse_errors: doc.errors,
    match: matchResult,
  })
}
