import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

function mapRemoteStatus(status: string | undefined): string {
  const s = (status || '').toUpperCase()
  if (['ACSC', 'ACCP', 'ACSP', 'SUCC', 'SUCCESS', 'COMPLETED'].includes(s)) {
    return 'succeeded'
  }
  if (['RJCT', 'FAILED'].includes(s)) return 'failed'
  if (['CANC', 'CANCELLED', 'CANCELED'].includes(s)) return 'canceled'
  if (['RCVD', 'PDNG', 'ACTC', 'ACWC', 'PENDING'].includes(s)) return 'pending_bank'
  return 'created'
}

/**
 * Financy payment status webhook.
 * Auth: ?token= must match FINANCY_WEBHOOK_SECRET (platform).
 */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') || ''
  const secret = process.env.FINANCY_WEBHOOK_SECRET || ''
  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const paymentId = String(
    body.paymentId || body.id || (body.data as { paymentId?: string } | undefined)?.paymentId || ''
  )
  const statusRaw = String(
    body.paymentStatus || body.status || (body.data as { status?: string } | undefined)?.status || ''
  )
  if (!paymentId) {
    return NextResponse.json({ error: 'paymentId required' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const nextStatus = mapRemoteStatus(statusRaw)

  const { data: rows, error } = await admin
    .from('bank_transfers')
    .update({
      status: nextStatus,
      raw: body,
      updated_at: new Date().toISOString(),
    })
    .eq('financy_payment_id', paymentId)
    .select('id, client_id, status')
    .limit(5)

  if (error) {
    console.error('[webhook/financy-payment]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    updated: rows?.length || 0,
    status: nextStatus,
  })
}
