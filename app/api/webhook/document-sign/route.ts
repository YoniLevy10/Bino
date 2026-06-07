import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'

const logger = getLogger()

const bodySchema = z.object({
  request_id: z.string().uuid(),
  status: z.enum(['signed', 'declined', 'expired', 'cancelled']),
  external_id: z.string().max(200).optional(),
})

/** Provider callback (DocuSign / Comsign) — updates document_sign_requests status. */
export async function POST(req: Request) {
  const secret = (process.env.DOCUMENT_SIGN_WEBHOOK_SECRET || '').trim()
  if (!secret) {
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })
  }

  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('document_sign_requests')
    .update({
      status: parsed.data.status,
      external_id: parsed.data.external_id ?? undefined,
      signed_at: parsed.data.status === 'signed' ? now : null,
    })
    .eq('id', parsed.data.request_id)
    .select('id, client_id, status')
    .maybeSingle()

  if (error) {
    logger.error('DOC_SIGN_WEBHOOK', 'update failed', new Error(error.message))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'request not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, request: data })
}
