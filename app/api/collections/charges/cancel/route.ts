import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { cancelCollectionChargeBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { cancelCollectionCharge } from '@/lib/collection-charge-ops'

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'collections-cancel-charge')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const validated = cancelCollectionChargeBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const result = await cancelCollectionCharge(admin, {
    clientId: auth.ctx.clientId,
    chargeId: validated.data.charge_id,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
