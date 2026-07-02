import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken, verifyWorkerOwnsTicket } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { completeWorkerTicketWithPhoto } from '@/lib/worker-ticket-complete'

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-complete')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const formData = await req.formData()
    const token = sanitizeId(formData.get('token')?.toString() ?? null)
    const ticketId = sanitizeId(formData.get('ticket_id')?.toString() ?? null)
    const fileValue = formData.get('file')
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null

    if (!token || !ticketId) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const owns = await verifyWorkerOwnsTicket(admin, ticketId, worker.id, worker.client_id)
    if (!owns) return NextResponse.json({ error: 'תקלה לא נמצאה' }, { status: 404 })

    const result = await completeWorkerTicketWithPhoto(admin, {
      clientId: worker.client_id,
      workerId: worker.id,
      ticketId,
      file,
    })

    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'שגיאת שרת'
    const status = message.includes('חסרה תמונה') || message.includes('קובץ') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
