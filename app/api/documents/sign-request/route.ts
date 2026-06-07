import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { documentSignRequestBodySchema } from '@/lib/whatsapp-api-schemas'
import { createDocumentSignRequest } from '@/lib/document-signing'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.project_documents)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'document-sign')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const parsed = documentSignRequestBodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  let documentPath = parsed.data.document_path
  if (parsed.data.document_id) {
    const { data: docRow, error: docErr } = await admin
      .from('project_documents')
      .select('storage_path, project_id')
      .eq('id', parsed.data.document_id)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()
    if (docErr || !docRow) {
      return NextResponse.json({ error: 'מסמך לא נמצא' }, { status: 404 })
    }
    const row = docRow as { storage_path: string; project_id: string }
    if (row.project_id !== parsed.data.project_id) {
      return NextResponse.json({ error: 'מסמך לא שייך לפרויקט' }, { status: 400 })
    }
    documentPath = row.storage_path
  }
  if (!documentPath) {
    return NextResponse.json({ error: 'חסר נתיב מסמך' }, { status: 400 })
  }

  try {
    const row = await createDocumentSignRequest(admin, {
      clientId: auth.ctx.clientId,
      projectId: parsed.data.project_id,
      documentPath,
      documentName: parsed.data.document_name,
      signerName: parsed.data.signer_name,
      signerPhone: parsed.data.signer_phone,
      signerEmail: parsed.data.signer_email || undefined,
      signUrl: parsed.data.sign_url,
      sendVia: parsed.data.send_via ?? 'none',
    })
    return NextResponse.json({ request: row })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה' },
      { status: 500 }
    )
  }
}

export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('document_sign_requests')
    .select('id, document_name, signer_name, status, sign_url, created_at, sent_at, signed_at')
    .eq('client_id', auth.ctx.clientId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ items: data ?? [] })
}
