import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { smsCampaignBodySchema } from '@/lib/whatsapp-api-schemas'
import { runSmsCampaign } from '@/lib/sms-campaigns'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.campaigns)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'sms-campaign')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const parsed = smsCampaignBodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('sms_sender_name')
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  try {
    const result = await runSmsCampaign(admin, {
      clientId: auth.ctx.clientId,
      projectId: parsed.data.project_id,
      campaignName: parsed.data.campaign_name || 'קמפיין',
      messageBody: parsed.data.message_body,
      dryRun: parsed.data.dry_run === true,
      createdBy: auth.ctx.userId,
      senderName: (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name ?? null,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שליחה נכשלה' },
      { status: 400 }
    )
  }
}
