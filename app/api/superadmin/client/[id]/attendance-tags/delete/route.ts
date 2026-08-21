import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminAuthorized } from '@/lib/superadmin-auth'
import { deleteNfcTagBodySchema } from '@/lib/api-body-schemas'

/**
 * Hard-delete an NFC tag row. Attendance history keeps events (tag_id SET NULL).
 * Physical stickers with that URL will no longer resolve — use only when retiring a field tag.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: clientId } = await params
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const parsed = deleteNfcTagBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { tag_id } = parsed.data

  const { data: tag, error: fetchErr } = await admin
    .from('worker_nfc_tags')
    .select('id, tag_code')
    .eq('id', tag_id)
    .eq('client_id', clientId)
    .maybeSingle()

  if (fetchErr || !tag) {
    return NextResponse.json({ error: 'תג לא נמצא' }, { status: 404 })
  }

  const { error } = await admin
    .from('worker_nfc_tags')
    .delete()
    .eq('id', tag_id)
    .eq('client_id', clientId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted_id: tag_id, tag_code: tag.tag_code })
}
