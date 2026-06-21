import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { waBroadcastBodySchema } from '@/lib/whatsapp-api-schemas'
import { runWhatsAppBroadcast } from '@/lib/wa-broadcast'
import { listWaBroadcastTemplates } from '@/lib/wa-broadcast-policy'

export async function GET() {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

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

  try {
    const result = await runWhatsAppBroadcast(admin, {
      clientId: auth.ctx.clientId,
      projectId: parsed.data.project_id,
      templateId: parsed.data.template_id,
      templateName: parsed.data.template_name,
      templateLanguage: parsed.data.template_language,
      bodyParams: parsed.data.body_params,
      bodyParam: parsed.data.body_param,
      dryRun,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה' },
      { status: 400 }
    )
  }
}
