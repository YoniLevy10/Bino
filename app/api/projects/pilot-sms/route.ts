import { NextResponse } from 'next/server'
import { requireSessionClientIdWithNavFeature } from '@/lib/api-nav-guard'
import { projectPilotSmsBodySchema } from '@/lib/api-body-schemas'
import { runProjectPilotSms } from '@/lib/project-pilot-sms'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  const auth = await requireSessionClientIdWithNavFeature('pilot_sms')
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'project-pilot-sms')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = projectPilotSmsBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { clientId, userId } = auth.ctx
  const dryRun = parsed.data.dry_run === true

  const { data: clientRow } = await admin
    .from('clients')
    .select('sms_sender_name')
    .eq('id', clientId)
    .maybeSingle()

  try {
    const result = await runProjectPilotSms({
      admin,
      clientId,
      projectId: parsed.data.project_id,
      smsSenderName: (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name ?? null,
      dryRun,
    })

    if (!dryRun) {
      await admin.from('project_pilot_sms_runs').insert({
        client_id: clientId,
        project_id: parsed.data.project_id,
        sent_by: userId,
        recipients_total: result.recipientsTotal,
        sent_count: result.sent,
        failed_count: result.failed,
        skipped_no_phone: result.skippedNoPhone,
        dry_run: false,
      })
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      message_length: result.messageLength,
      recipients_total: result.recipientsTotal,
      skipped_no_phone: result.skippedNoPhone,
      sent: result.sent,
      failed: result.failed,
      failures: result.failures,
      message_preview: result.message,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאת שרת'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
