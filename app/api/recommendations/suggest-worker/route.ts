import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { suggestWorkerForTicketId } from '@/lib/recommendations/suggest-worker-for-ticket'

export async function GET(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const ticketId = new URL(req.url).searchParams.get('ticket_id')?.trim()
  if (!ticketId) {
    return NextResponse.json({ error: 'חסר מזהה תקלה' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const suggestion = await suggestWorkerForTicketId(admin, auth.ctx.clientId, ticketId)
  return NextResponse.json({ suggestion })
}
