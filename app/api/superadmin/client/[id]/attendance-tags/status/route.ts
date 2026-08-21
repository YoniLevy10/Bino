import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminAuthorized } from '@/lib/superadmin-auth'
import { patchNfcTagActiveBodySchema } from '@/lib/api-body-schemas'

/** Soft-disable / re-enable an NFC tag. Inactive tags reject stamps; physical sticker URL stays the same. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = patchNfcTagActiveBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { tag_id, is_active } = parsed.data

  const { data: tag, error: fetchErr } = await admin
    .from('worker_nfc_tags')
    .select('id')
    .eq('id', tag_id)
    .eq('client_id', clientId)
    .maybeSingle()

  if (fetchErr || !tag) {
    return NextResponse.json({ error: 'תג לא נמצא' }, { status: 404 })
  }

  const { data: updated, error } = await admin
    .from('worker_nfc_tags')
    .update({
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tag_id)
    .eq('client_id', clientId)
    .select('id, tag_code, is_active')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tag: updated })
}
