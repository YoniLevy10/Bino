import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendWhatsAppTextMessageWithCredentials } from '@/lib/whatsapp-send'
import { requireSessionMinRole } from '@/lib/api-auth'
import { settingsTestWhatsAppBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getLogger, getAuditLogger } from '@/lib/logging'

/**
 * Sends a test WhatsApp using credentials stored on `clients` (not .env).
 */
export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `test-whatsapp-${Date.now()}`
  try {
    const auth = await requireSessionMinRole('admin')
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()

    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'settings-test-whatsapp')
    if (rl.isLimited) {
      audit.logFailedOperation('SEND', 'WHATSAPP_TEST', 'n/a', 'single-tenant', 'rate_limited')
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    let rawBody: unknown = {}
    try {
      rawBody = await req.json()
    } catch {
      rawBody = {}
    }
    const vb = settingsTestWhatsAppBodySchema.safeParse(rawBody)
    if (!vb.success) {
      return NextResponse.json({ error: vb.error.flatten() }, { status: 400 })
    }

    const { data: client, error } = await admin
      .from('clients')
      .select('name, whatsapp_phone_number_id, whatsapp_access_token, manager_phone')
      .eq('id', clientId)
      .single()

    if (error || !client) {
      audit.logFailedOperation('READ', 'CLIENT', clientId, 'single-tenant', 'client_not_found')
      return NextResponse.json({ error: 'לקוח לא נמצא', requestId }, { status: 404 })
    }

    const phoneNumberId = client.whatsapp_phone_number_id as string | null
    const accessToken = client.whatsapp_access_token as string | null
    const toOverride = vb.data.to?.trim()
    const to = (toOverride ||
      ((client.manager_phone as string | null)?.trim())) as string | null

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { error: 'נדרשים מזהה מספר וואטסאפ וטוקן בהגדרות', requestId },
        { status: 400 }
      )
    }

    if (!to) {
      return NextResponse.json(
        { error: 'נדרש מספר מנהל בהגדרות (התראות) לשליחת בדיקה', requestId },
        { status: 400 }
      )
    }

    const digits = to.replace(/\D/g, '')
    const waTo =
      digits.startsWith('972') ? digits : digits.startsWith('0') ? `972${digits.slice(1)}` : digits

    const sent = await sendWhatsAppTextMessageWithCredentials(
      phoneNumberId,
      accessToken,
      waTo,
      `✅ בדיקת חיבור מהמערכת — ${(client as { name?: string | null }).name || 'המערכת'}`
    )
    if (!sent) {
      return NextResponse.json({ error: 'שליחת וואטסאפ נכשלה — בדקו לוגים', requestId }, { status: 502 })
    }

    audit.logAction('SEND', 'WHATSAPP_TEST', 'n/a', 'single-tenant', 'dashboard', undefined, 'SUCCESS')
    logger.info('SETTINGS', 'Test WhatsApp sent', { requestId, clientId })
    return NextResponse.json({ success: true, requestId })
  } catch (e) {
    console.error('[settings/test-whatsapp]', e)
    logger.error('SETTINGS', 'Test WhatsApp failed', e instanceof Error ? e : new Error(String(e)), { requestId })
    audit.logFailedOperation('SEND', 'WHATSAPP_TEST', 'n/a', 'single-tenant', 'exception', 'dashboard')
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}
