import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientId } from '@/lib/api-auth'
import { getLogger, getAuditLogger } from '@/lib/logging'
import {
  CLIENT_LOGOS_BUCKET,
  clientLogoExtension,
  resolveClientLogoMime,
  validateClientLogoFile,
} from '@/lib/client-logo-upload'

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `upload-logo-${Date.now()}`
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'settings-upload-logo')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const formData = await req.formData()
    const file = formData.get('file')
    const fileName = file instanceof File ? file.name : null

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'חסר קובץ', requestId }, { status: 400 })
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

    const { error: upErr } = await admin.storage.from(CLIENT_LOGOS_BUCKET).upload(path, buf, {
      contentType: mime!,
      upsert: true,
    })

    if (upErr) {
      logger.error('SETTINGS', 'Logo upload failed', new Error(upErr.message), { requestId, clientId })
      audit.logFailedOperation('UPLOAD', 'CLIENT_LOGO', clientId, clientId, upErr.message)
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

    audit.logAction('UPLOAD', 'CLIENT_LOGO', clientId, clientId, 'dashboard')
    return NextResponse.json({ url: logoUrl, requestId })
  } catch (e) {
    console.error('[settings/upload-logo]', e)
    logger.error('SETTINGS', 'Unhandled upload-logo error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}
