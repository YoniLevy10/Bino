import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { handleResidentBotTurn } from '@/lib/resident-portal/bot'
import type { TicketScope } from '@/lib/resident-portal/types'

export async function POST(req: Request) {
  const auth = await requireResidentContext({ request: req })
  if (!auth.ok) return auth.response

  let body: {
    message?: unknown
    confirmCreate?: unknown
    scope?: unknown
    idempotency_key?: unknown
    trade_category?: unknown
    sector_id?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message : ''
  const confirmCreate = Boolean(body.confirmCreate)
  const scopeRaw = typeof body.scope === 'string' ? body.scope : null
  const scope =
    scopeRaw && ['common', 'private', 'unclear'].includes(scopeRaw)
      ? (scopeRaw as TicketScope)
      : null

  try {
    const result = await handleResidentBotTurn(auth.ctx.admin, auth.ctx.membership, {
      userId: auth.ctx.userId,
      message,
      confirmCreate,
      scopeOverride: scope,
      idempotencyKey:
        typeof body.idempotency_key === 'string' ? body.idempotency_key : null,
      tradeCategory:
        typeof body.trade_category === 'string' ? body.trade_category : null,
      sectorId: typeof body.sector_id === 'number' ? body.sector_id : null,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[resident/chat]', e)
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : 'הבוט נכשל',
        fallback: '/resident/tickets',
      },
      { status: 500 }
    )
  }
}
