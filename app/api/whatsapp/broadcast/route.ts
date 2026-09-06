import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { waBroadcastBodySchema } from '@/lib/whatsapp-api-schemas'
import {
  enqueueWhatsAppBroadcast,
  markWaBroadcastRun,
  runWhatsAppBroadcast,
} from '@/lib/wa-broadcast'
import { listWaBroadcastTemplates } from '@/lib/wa-broadcast-policy'
import { runAfterResponse } from '@/lib/run-after-response'
import { getWaBroadcastRun } from '@/lib/notification-runs'

/** Allow SMS/WhatsApp side-effects without Vercel hard-kill. */
export const maxDuration = 60

export async function GET(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const runId = new URL(req.url).searchParams.get('run_id')
  if (runId) {
    const admin = getSupabaseAdmin()
    const run = await getWaBroadcastRun(admin, auth.ctx.clientId, runId)
    if (!run) return NextResponse.json({ error: 'רצה לא נמצאה' }, { status: 404 })
    return NextResponse.json(run)
  }

  return NextResponse.json({
    templates: listWaBroadcastTemplates().map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
      params: t.params,
      meta_name: t.resolveMetaName(),
    })),
  })
}

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'wa-broadcast')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const parsed = waBroadcastBodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const dryRun = parsed.data.dry_run === true
  if (!dryRun && parsed.data.ack_wa_policy !== true) {
    return NextResponse.json(
      {
        error: 'יש לאשר את מדיניות WhatsApp לפני שליחה (ack_wa_policy)',
        code: 'WA_POLICY_ACK_REQUIRED',
      },
      { status: 400 }
    )
  }

  const broadcastOpts = {
    clientId: auth.ctx.clientId,
    projectId: parsed.data.project_id,
    templateId: parsed.data.template_id,
    templateName: parsed.data.template_name,
    templateLanguage: parsed.data.template_language,
    bodyParams: parsed.data.body_params,
    bodyParam: parsed.data.body_param,
    dryRun,
  }

  try {
    if (dryRun) {
      const result = await runWhatsAppBroadcast(admin, broadcastOpts)
      return NextResponse.json(result)
    }

    // Validate + count via dry run first (no sends), then queue real send.
    const preview = await runWhatsAppBroadcast(admin, { ...broadcastOpts, dryRun: true })
    const runId = await enqueueWhatsAppBroadcast(admin, {
      clientId: auth.ctx.clientId,
      projectId: parsed.data.project_id,
      templateName: preview.template_name,
      templateLanguage: parsed.data.template_language || 'he',
      recipientsTotal: preview.recipients_total,
    })

    runAfterResponse('wa-broadcast-process', async () => {
      await markWaBroadcastRun(admin, runId, { status: 'running' })
      try {
        await runWhatsAppBroadcast(admin, { ...broadcastOpts, existingRunId: runId })
      } catch (e) {
        await markWaBroadcastRun(admin, runId, {
          status: 'failed',
          error_message: e instanceof Error ? e.message : String(e),
          finished_at: new Date().toISOString(),
        })
        throw e
      }
    })

    return NextResponse.json(
      {
        ...preview,
        dry_run: false,
        sent: 0,
        failed: 0,
        run_id: runId,
        status: 'queued',
      },
      { status: 202 }
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה' },
      { status: 400 }
    )
  }
}
