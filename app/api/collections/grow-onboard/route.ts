import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { formatZodError } from '@/lib/format-zod-error'
import { getPublicAppUrl } from '@/lib/public-app-url'
import {
  buildGrowRegisterWebhookUrl,
  createGrowRegistrationLink,
  isGrowRegisterReady,
} from '@/lib/grow-register'

const bodySchema = z.object({
  business_number: z.string().min(8).max(20),
  phone: z.string().min(9).max(20),
  send_sms: z.boolean().optional(),
})

export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.ctx.admin
    .from('clients')
    .select(
      `
      grow_user_id, grow_enabled, grow_encrypted_lead, grow_onboarding_url,
      grow_onboarding_status, grow_onboarding_phone, grow_business_number,
      grow_onboarding_started_at, grow_onboarding_completed_at, grow_package_name
    `
    )
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    register_ready: isGrowRegisterReady(),
    register_webhook_url: buildGrowRegisterWebhookUrl(),
    onboarding: data || null,
  })
}

export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'collections-grow-onboard'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  if (!isGrowRegisterReady()) {
    return NextResponse.json(
      {
        error:
          'הרשמת Grow לא מוגדרת בשרת, או שחסר GROW_WEBHOOK_SECRET / NEXT_PUBLIC_APP_URL לכתובת ה-webhook.',
        register_webhook_url: buildGrowRegisterWebhookUrl(),
      },
      { status: 503 }
    )
  }

  const raw = await req.json().catch(() => null)
  const validated = bodySchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const admin = auth.ctx.admin
  const clientId = auth.ctx.clientId
  const website = `${getPublicAppUrl()}/vaad-pay/${clientId}`
  const result = await createGrowRegistrationLink({
    businessNumber: validated.data.business_number,
    phone: validated.data.phone,
    website,
    sendSms: validated.data.send_sms !== false,
  })

  if (!result.ok) {
    const status =
      result.code === 'EXISTING_BUSINESS' || result.code === 'OPEN_PROCESS' ? 409 : 400
    if (result.code === 'EXISTING_BUSINESS' || result.code === 'OPEN_PROCESS') {
      await admin
        .from('clients')
        .update({
          grow_onboarding_status: result.code === 'EXISTING_BUSINESS' ? 'existing' : 'pending',
          grow_business_number: validated.data.business_number.replace(/\D/g, ''),
          grow_onboarding_phone: validated.data.phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clientId)
    }
    return NextResponse.json(
      { error: result.error, code: result.code, err_id: result.errId },
      { status }
    )
  }

  const now = new Date().toISOString()
  const { error } = await admin
    .from('clients')
    .update({
      grow_encrypted_lead: result.encryptedLead,
      grow_onboarding_url: result.url,
      grow_onboarding_status: 'pending',
      grow_onboarding_phone: validated.data.phone,
      grow_business_number: validated.data.business_number.replace(/\D/g, ''),
      grow_onboarding_started_at: now,
      grow_onboarding_completed_at: null,
      updated_at: now,
    })
    .eq('id', clientId)

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'קוד מעקב Grow כבר משויך ללקוח אחר. פנו לתמיכה.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    url: result.url,
    status: 'pending',
    register_webhook_url: buildGrowRegisterWebhookUrl(),
    hint: 'אחרי אישור Grow, userId יישמר אוטומטית אם Webhook ההרשמה מוגדר אצלם לכתובת Bino.',
  })
}
