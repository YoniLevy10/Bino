import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { formatZodError } from '@/lib/format-zod-error'
import { getPublicAppUrl } from '@/lib/public-app-url'
import {
  buildGrowRegisterWebhookUrl,
  createGrowRegistrationLink,
  isGrowRegisterReady,
} from '@/lib/grow-register'
import { loadProjectGrowRow, PROJECT_GROW_SELECT } from '@/lib/project-grow'

const bodySchema = z.object({
  /** When set — GetLink binds to this building (preferred). */
  project_id: z.string().uuid().optional(),
  business_number: z.string().min(8).max(20),
  phone: z.string().min(9).max(20),
  send_sms: z.boolean().optional(),
})

export async function GET(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() || ''

  if (projectId) {
    const row = await loadProjectGrowRow(auth.ctx.admin, auth.ctx.clientId, projectId)
    if (!row) {
      return NextResponse.json({ error: 'בניין לא נמצא' }, { status: 404 })
    }
    return NextResponse.json({
      ok: true,
      scope: 'project',
      register_ready: isGrowRegisterReady(),
      register_webhook_url: buildGrowRegisterWebhookUrl(),
      onboarding: {
        grow_user_id: row.grow_user_id,
        grow_enabled: row.grow_enabled,
        grow_encrypted_lead: row.grow_encrypted_lead,
        grow_onboarding_url: row.grow_onboarding_url,
        grow_onboarding_status: row.grow_onboarding_status,
        grow_onboarding_phone: row.grow_onboarding_phone,
        grow_business_number: row.grow_business_number,
        grow_onboarding_started_at: row.grow_onboarding_started_at,
        grow_onboarding_completed_at: row.grow_onboarding_completed_at,
        grow_package_name: row.grow_package_name,
        project_id: row.id,
        project_name: row.name,
      },
    })
  }

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
    scope: 'client',
    register_ready: isGrowRegisterReady(),
    register_webhook_url: buildGrowRegisterWebhookUrl(),
    onboarding: data || null,
  })
}

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
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
  const projectId = validated.data.project_id

  if (projectId) {
    const project = await loadProjectGrowRow(admin, clientId, projectId)
    if (!project) {
      return NextResponse.json({ error: 'בניין לא נמצא' }, { status: 404 })
    }
  }

  const website = `${getPublicAppUrl()}/vaad-pay/${clientId}`
  const result = await createGrowRegistrationLink({
    businessNumber: validated.data.business_number,
    phone: validated.data.phone,
    website,
    sendSms: validated.data.send_sms !== false,
  })

  const statusPatch = {
    grow_onboarding_status:
      result.ok === false && result.code === 'EXISTING_BUSINESS'
        ? 'existing'
        : 'pending',
    grow_business_number: validated.data.business_number.replace(/\D/g, ''),
    grow_onboarding_phone: validated.data.phone,
  }

  if (!result.ok) {
    const status =
      result.code === 'EXISTING_BUSINESS' || result.code === 'OPEN_PROCESS' ? 409 : 400
    if (result.code === 'EXISTING_BUSINESS' || result.code === 'OPEN_PROCESS') {
      if (projectId) {
        await admin.from('projects').update(statusPatch).eq('id', projectId).eq('client_id', clientId)
      } else {
        await admin.from('clients').update(statusPatch).eq('id', clientId)
      }
    }
    return NextResponse.json(
      { error: result.error, code: result.code, err_id: result.errId },
      { status }
    )
  }

  const now = new Date().toISOString()
  const onboardPatch = {
    grow_encrypted_lead: result.encryptedLead,
    grow_onboarding_url: result.url,
    grow_onboarding_status: 'pending',
    grow_onboarding_phone: validated.data.phone,
    grow_business_number: validated.data.business_number.replace(/\D/g, ''),
    grow_onboarding_started_at: now,
    grow_onboarding_completed_at: null,
  }

  if (projectId) {
    const { data, error } = await admin
      .from('projects')
      .update(onboardPatch)
      .eq('id', projectId)
      .eq('client_id', clientId)
      .select(PROJECT_GROW_SELECT)
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'קוד מעקב Grow כבר משויך לבניין או לקוח אחר. פנו לתמיכה.' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      scope: 'project',
      project_id: projectId,
      url: result.url,
      status: 'pending',
      project: data,
      register_webhook_url: buildGrowRegisterWebhookUrl(),
      hint: 'אחרי אישור Grow, userId יישמר על הבניין אם Webhook ההרשמה מוגדר אצלם לכתובת Bino.',
    })
  }

  const { error } = await admin.from('clients').update(onboardPatch).eq('id', clientId)

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
    scope: 'client',
    url: result.url,
    status: 'pending',
    register_webhook_url: buildGrowRegisterWebhookUrl(),
    hint: 'אחרי אישור Grow, userId יישמר אוטומטית אם Webhook ההרשמה מוגדר אצלם לכתובת Bino.',
  })
}
