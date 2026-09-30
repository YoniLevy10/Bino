import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { getPayableChargeToken } from '@/lib/resident-portal/charges'

/** Returns pay path only after membership owns the charge. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireResidentContext({ request: req })
  if (!auth.ok) return auth.response
  const { id } = await ctx.params

  try {
    const token = await getPayableChargeToken(auth.ctx.admin, auth.ctx.membership, id)
    if (!token) {
      return NextResponse.json(
        { error: 'החיוב אינו זמין לתשלום עבור חברות זו' },
        { status: 403 }
      )
    }
    return NextResponse.json({
      payPath: `/pay/${token.public_token}`,
      // Explicit: client must not mark paid from URL alone
      statusHint: 'pending_server_confirmation',
    })
  } catch (e) {
    console.error('[resident/charges/pay]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה' },
      { status: 500 }
    )
  }
}
