import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { getConfiguredGrowWebhookUrl } from '@/lib/collection-charge-ops'

/** Returns whether the Grow notify URL is configured on the server (Bino registers it per request). */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const result = getConfiguredGrowWebhookUrl()
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, configured: false }, { status: 503 })
  }
  return NextResponse.json({ ok: true, configured: true, url: result.url })
}
