import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger, getAuditLogger } from '@/lib/logging'

const BUCKET = 'client-logos'

function isAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET?.trim()
  if (!secret) return false
  return (req.headers.get('x-admin-secret') ?? '') === secret
}

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `admin-upload-logo-${Date.now()}`

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const clientId = String(formData.get('client_id') ?? '').trim()

    if (!clientId) {
      return NextResponse.json({ error: 'חסר client_id', requestId }, { status: 400 })
    }
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'חסר קובץ', requestId }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const { data: clientRow } = await admin.from('clients').select('id').eq('id', clientId).maybeSingle()
    if (!clientRow) {
      return NextResponse.json({ error: 'Client not found', requestId }, { status: 404 })
    }

    const mime = file.type || 'application/octet-stream'
    const size = file.size || 0
    const MAX = 2 * 1024 * 1024
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp'])
    if (!allowed.has(mime)) {
      return NextResponse.json({ error: 'סוג קובץ לא נתמך (PNG/JPEG/WEBP בלבד)', requestId }, { status: 400 })
    }
    if (size <= 0 || size > MAX) {
      return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 2MB)', requestId }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('png') ? 'png' : 'webp'
    const path = `${clientId}/logo-${Date.now()}.${ext}`

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
      contentType: mime,
      upsert: true,
    })
    if (upErr) {
      logger.error('ADMIN', 'Client logo upload failed', new Error(upErr.message), { requestId, clientId })
      return NextResponse.json({ error: 'העלאה נכשלה', requestId }, { status: 500 })
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
    const logoUrl = pub.publicUrl

    const { error: dbErr } = await admin.from('clients').update({ logo_url: logoUrl }).eq('id', clientId)
    if (dbErr) {
      return NextResponse.json({ error: dbErr.message, requestId }, { status: 500 })
    }

    audit.logAction('UPLOAD', 'CLIENT_LOGO', clientId, clientId, 'admin')
    return NextResponse.json({ url: logoUrl, client_id: clientId, requestId })
  } catch (e) {
    logger.error('ADMIN', 'Unhandled upload-client-logo error', e instanceof Error ? e : new Error(String(e)), {
      requestId,
    })
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}
