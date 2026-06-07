import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'

/**
 * Morning (Green Invoice) webhook receiver — payment / document events.
 * Configure in Morning: Settings → Webhooks → callback URL = /api/webhook/greeninvoice
 *
 * MVP: acknowledge and log payload. Payment status updates will be wired when /collections ships.
 */
export async function POST(req: Request) {
  const logger = getLogger()
  try {
    const rawBody = await req.text()
    let payload: unknown = null
    try {
      payload = rawBody ? JSON.parse(rawBody) : null
    } catch {
      payload = { raw: rawBody.slice(0, 2000) }
    }

    const signature = req.headers.get('x-data-signature')
    logger.info('WEBHOOK', 'Green Invoice webhook received', {
      hasSignature: Boolean(signature),
      payloadPreview:
        typeof payload === 'object' && payload !== null
          ? JSON.stringify(payload).slice(0, 500)
          : String(payload).slice(0, 500),
    })

    // Future: match paymentId / documentId → collection_charges.status = 'paid'
    void getSupabaseAdmin()

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[webhook/greeninvoice]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** Some providers verify webhook URL with GET. */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'greeninvoice-webhook' })
}
