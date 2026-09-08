import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { emailSendBodySchema } from '@/lib/whatsapp-api-schemas'
import { sendResendEmail } from '@/lib/email-resend'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'

export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'email-send')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const parsed = emailSendBodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Prevent open relay: only allow sending a test email to the signed-in user.
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const sessionEmail = (user?.email || '').trim().toLowerCase()
  const to = parsed.data.to.trim().toLowerCase()
  if (!sessionEmail || to !== sessionEmail) {
    return NextResponse.json(
      { error: 'ניתן לשלוח מייל בדיקה רק לכתובת המחוברת לחשבון' },
      { status: 403 }
    )
  }

  const result = await sendResendEmail(parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, id: result.id })
}
