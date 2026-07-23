import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger, getAuditLogger } from '@/lib/logging'
import {
  CLIENT_LOGOS_BUCKET,
  clientLogoExtension,
  ensureClientLogosBucket,
  resolveClientLogoMime,
  validateClientLogoFile,
} from '@/lib/client-logo-upload'

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
    const fileName = file instanceof File ? file.name : null

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

    const size = file.size || 0
    const buf = Buffer.from(await file.arrayBuffer())
    const mime = resolveClientLogoMime(file, fileName, buf)
    const validationError = validateClientLogoFile(size, mime)
    if (validationError) {
      return NextResponse.json({ error: validationError, requestId }, { status: 400 })
    }

    const ext = clientLogoExtension(mime!)
    const path = `${clientId}/logo-${Date.now()}.${ext}`

    await ensureClientLogosBucket(admin)

    const { error: upErr } = await admin.storage.from(CLIENT_LOGOS_BUCKET).upload(path, buf, {
      contentType: mime!,
      upsert: true,
    })
    if (upErr) {
      logger.error('ADMIN', 'Client logo upload failed', new Error(upErr.message), { requestId, clientId })
      const hint =
        upErr.message.includes('Bucket not found') || upErr.message.includes('not found')
          ? 'דלי האחסון client-logos חסר — הריצו מיגרציה 058_client_logos_bucket.sql'
          : upErr.message
      return NextResponse.json({ error: `העלאה נכשלה: ${hint}`, requestId }, { status: 500 })
    }

    const { data: pub } = admin.storage.from(CLIENT_LOGOS_BUCKET).getPublicUrl(path)
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
