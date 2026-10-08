import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { settingsUpdateBodySchema } from '@/lib/api-body-schemas'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/format-zod-error'
import {
  assertTenantCanEnableGrow,
  findOtherClientUsingGrowUserId,
  normalizeGrowUserId,
} from '@/lib/grow-credentials'
import { normalizePhone019 } from '@/lib/sms-019-core'

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
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
  if ('grow_user_id' in payload) {
    payload.grow_user_id = normalizeGrowUserId(
      payload.grow_user_id as string | null | undefined
    )
  }
  // 019SMS rejects alphanumeric senders (status 515). Persist only normalized phones.
  if ('sms_sender_name' in payload) {
    const raw = payload.sms_sender_name
    if (raw == null || String(raw).trim() === '') {
      payload.sms_sender_name = null
    } else {
      const normalized = normalizePhone019(String(raw))
      if (!normalized) {
        return NextResponse.json(
          {
            error:
              'מספר שולח SMS חייב להיות טלפון ישראלי (05… / 9725…) — שמות כמו מוקד במקור נדחים ע״י 019SMS',
          },
          { status: 400 }
        )
      }
      payload.sms_sender_name = normalized
    }
  }

  const touchesGrow = 'grow_enabled' in payload || 'grow_user_id' in payload
  if (touchesGrow) {
    const { data: current, error: currentErr } = await admin
      .from('clients')
      .select('grow_enabled, grow_user_id')
      .eq('id', clientId)
      .maybeSingle()

    if (currentErr || !current) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const nextUserId =
      payload.grow_user_id !== undefined
        ? (payload.grow_user_id as string | null)
        : current.grow_user_id
    const nextEnabled =
      payload.grow_enabled !== undefined
        ? Boolean(payload.grow_enabled)
        : current.grow_enabled === true

    const enableCheck = assertTenantCanEnableGrow({
      enabled: nextEnabled,
      userId: nextUserId,
    })
    if (!enableCheck.ok) {
      return NextResponse.json({ error: enableCheck.error }, { status: 400 })
    }

    if (nextUserId) {
      const conflict = await findOtherClientUsingGrowUserId(
        admin,
        nextUserId,
        clientId
      )
      if (conflict) {
        return NextResponse.json(
          {
            error:
              'מזהה Grow זה כבר משויך ללקוח או לבניין אחר. כל בניין צריך חשבון Grow נפרד.',
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
            'מזהה Grow זה כבר בשימוש אצל לקוח אחר. הזינו את ה-userId מחשבון Grow שלכם בלבד.',
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
