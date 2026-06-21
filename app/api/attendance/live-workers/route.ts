import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

/** Who is in an open shift right now. */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const { data, error } = await admin
    .from('worker_attendance')
    .select('id, worker_id, started_at, workers(full_name)')
    .eq('client_id', auth.ctx.clientId)
    .eq('status', 'open')
    .order('started_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }

  return NextResponse.json({ workers: data ?? [] })
}
