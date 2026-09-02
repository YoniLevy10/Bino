import { NextResponse } from 'next/server'
import { requireMbrainSession } from '@/lib/mbrain/auth'
import { buildFirstBamakorCampaignPack } from '@/lib/growth/first-campaign'

/** First Bamakor campaign pack — always draft, never auto-launches. */
export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const pack = buildFirstBamakorCampaignPack()
  return NextResponse.json({
    pack,
    warningHe:
      'חבילת קמפיין ראשונה לאישור בלבד. אין השקה אוטומטית ל-Meta ואין שליחת אאוטבאונד המונית.',
  })
}
