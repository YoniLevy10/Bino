import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionMinRole } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { saveWhatsappTemplatesBodySchema } from '@/lib/api-body-schemas'
import { getLogger } from '@/lib/logging'

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `save-templates-${Date.now()}`

  try {
    const auth = await requireSessionMinRole('admin')
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'save-whatsapp-templates')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json().catch(() => null)
    const validated = saveWhatsappTemplatesBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const now = new Date().toISOString()
    const rows = validated.data.templates.map((t) => ({
      client_id: clientId,
      template_key: t.template_key,
      template_text: t.template_text,
      updated_at: now,
    }))

    const { error } = await admin.from('whatsapp_templates').upsert(rows, {
      onConflict: 'client_id,template_key',
    })

    if (error) {
      logger.error('TEMPLATES_API', 'Save templates failed', new Error(error.message), { requestId, clientId })
      return NextResponse.json({ error: 'שמירה נכשלה', requestId }, { status: 500 })
    }

    return NextResponse.json({ success: true, requestId })
  } catch (e) {
    logger.error('TEMPLATES_API', 'save templates error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
