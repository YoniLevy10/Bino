import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { getConfiguredGreenInvoiceWebhookUrl } from '@/lib/collection-charge-ops'

/** Returns the Morning webhook URL including server-side token (managers copy into Morning). */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const result = getConfiguredGreenInvoiceWebhookUrl()
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, configured: false }, { status: 503 })
  }
  return NextResponse.json({ ok: true, configured: true, url: result.url })
}
