import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { settingsUpdateBodySchema } from '@/lib/api-body-schemas'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/format-zod-error'
import {
  assertTenantCanEnableMorning,
  findOtherClientUsingMorningApiKey,
} from '@/lib/greeninvoice-tenant-account'

export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response
  const { clientId, userId } = auth.ctx

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, userId, 'settings-update')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const rawBody = await req.json().catch(() => null)
  const validated = settingsUpdateBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const payload = validated.data as Record<string, unknown>
  const touchesMorning =
    'greeninvoice_enabled' in payload ||
    'greeninvoice_api_key_id' in payload ||
    'greeninvoice_api_secret' in payload

  if (touchesMorning) {
    const { data: current, error: currentErr } = await admin
      .from('clients')
      .select(
        'greeninvoice_enabled, greeninvoice_api_key_id, greeninvoice_api_secret'
      )
      .eq('id', clientId)
      .maybeSingle()

    if (currentErr || !current) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const nextKeyId =
      payload.greeninvoice_api_key_id !== undefined
        ? (payload.greeninvoice_api_key_id as string | null)
        : current.greeninvoice_api_key_id

    const nextSecretRaw =
      payload.greeninvoice_api_secret !== undefined
        ? (payload.greeninvoice_api_secret as string | null)
        : current.greeninvoice_api_secret

    const nextEnabled =
      payload.greeninvoice_enabled !== undefined
        ? Boolean(payload.greeninvoice_enabled)
        : current.greeninvoice_enabled === true

    const hasSecret = Boolean(
      typeof nextSecretRaw === 'string' && nextSecretRaw.trim()
    )

    const enableCheck = assertTenantCanEnableMorning({
      enabled: nextEnabled,
      apiKeyId: nextKeyId,
      hasSecret,
    })
    if (!enableCheck.ok) {
      return NextResponse.json({ error: enableCheck.error }, { status: 400 })
    }

    if (typeof nextKeyId === 'string' && nextKeyId.trim()) {
      const conflict = await findOtherClientUsingMorningApiKey(
        admin,
        nextKeyId,
        clientId
      )
      if (conflict) {
        return NextResponse.json(
          {
            error:
              'מפתח API זה כבר משויך ללקוח אחר במערכת. כל לקוח חייב חשבון Morning נפרד — אי אפשר לשתף כתובת/מפתחות בין חשבונות.',
          },
          { status: 409 }
        )
      }
    }
  }

  const { error } = await admin.from('clients').update(payload).eq('id', clientId)

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        {
          error:
            'מפתח API זה כבר בשימוש אצל לקוח אחר. הזינו מפתחות מחשבון Morning האישי שלכם בלבד.',
        },
        { status: 409 }
      )
    }
    console.error('[settings/update] supabase error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAudit({
    clientId,
    userId,
    action: 'UPDATE_CLIENT_SETTINGS',
    entityType: 'client',
    entityId: clientId,
    newValues: { fields: Object.keys(payload) },
  })

  return NextResponse.json({ ok: true })
}
