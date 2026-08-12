import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import {
  applyFixlyWebhookUpdate,
  verifyFixlyWebhookSignature,
  type FixlyWebhookPayload,
} from '@/lib/fixly-webhook'
import { getBamakorWebhookSecret } from '@/lib/fixly'

export const dynamic = 'force-dynamic'

/** POST /api/integrations/fixly/webhook — status updates from Fixly (HMAC signed) */
export async function POST(request: Request) {
  const logger = getLogger()

  try {
    if (!getBamakorWebhookSecret()) {
      logger.error('FIXLY', 'BAMAKOR_WEBHOOK_SECRET not set', new Error('missing secret'))
      return NextResponse.json({ error: 'server_error' }, { status: 500 })
    }

    const body = await request.text()
    const signature = request.headers.get('x-fixly-signature')

    if (!verifyFixlyWebhookSignature(body, signature)) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    let payload: FixlyWebhookPayload
    try {
      payload = JSON.parse(body) as FixlyWebhookPayload
    } catch {
      return NextResponse.json({ error: 'invalid json' }, { status: 400 })
    }

    if (!payload?.job_id || !payload?.status) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const result = await applyFixlyWebhookUpdate(supabase, payload)

    if (!result.ok) {
      const status = result.error === 'ticket_not_found' ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    logger.info('FIXLY', 'Webhook applied', {
      job_id: payload.job_id,
      status: payload.status,
      ignored: result.ignored ?? false,
      ticket_id: payload.external_ref?.ticket_id,
    })

    return NextResponse.json({ ok: true, ignored: result.ignored ?? false })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    logger.error('FIXLY', 'webhook route error', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
