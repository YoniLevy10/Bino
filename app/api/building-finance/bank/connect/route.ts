import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { formatZodError } from '@/lib/format-zod-error'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { isFinancyBankSyncEnabled } from '@/lib/bank/flags'
import {
  clearFinancyTokenCache,
  getFinancyAccessToken,
  isFinancyCredentialsComplete,
} from '@/lib/bank/financy-auth'
import { listConnections } from '@/lib/bank/financy-gateway'
import { formatFinancyError } from '@/lib/bank/financy-errors'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  financy_client_id: z.string().trim().min(1).max(200),
  financy_client_secret: z.string().trim().min(1).max(500),
  financy_user_id: z.string().trim().min(1).max(200),
  /** When true (default), verify token + list connections before saving. */
  verify: z.boolean().optional().default(true),
})

/**
 * Per-tenant Financy connect: save API credentials for this BINO client
 * and optionally verify against Financy (same surface as MCP/AIS).
 */
export async function POST(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyBankSyncEnabled()) {
    return NextResponse.json(
      { error: 'חשבון בנק כבוי בפלטפורמה', code: 'FINANCY_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'bank-financy-connect'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const validated = bodySchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const creds = {
    clientId: validated.data.financy_client_id,
    clientSecret: validated.data.financy_client_secret,
    userId: validated.data.financy_user_id,
  }
  if (!isFinancyCredentialsComplete(creds)) {
    return NextResponse.json({ error: 'חסרים פרטי חיבור' }, { status: 400 })
  }

  clearFinancyTokenCache(creds)

  let connectionCount = 0
  if (validated.data.verify !== false) {
    const token = await getFinancyAccessToken(creds)
    if (!token.ok) {
      console.warn('[financy-connect] token failed', token.error)
      return NextResponse.json(
        {
          error: `בדיקת חיבור נכשלה: ${token.error}`,
          code: 'FINANCY_TOKEN_FAILED',
        },
        { status: 400 }
      )
    }
    const listed = await listConnections(creds, { limit: 20 })
    if (!listed.ok) {
      console.warn('[financy-connect] listConnections failed', listed.error, listed.status)
      return NextResponse.json(
        {
          error: `בדיקת חיבור נכשלה: ${listed.error}`,
          code: 'FINANCY_VERIFY_FAILED',
        },
        { status: 400 }
      )
    }
    connectionCount = listed.data.items.length
  }

  const { error } = await admin
    .from('clients')
    .update({
      financy_enabled: true,
      financy_client_id: creds.clientId,
      financy_client_secret: creds.clientSecret,
      financy_user_id: creds.userId,
    })
    .eq('id', auth.ctx.clientId)

  if (error) {
    return NextResponse.json(
      { error: formatFinancyError({ message: error.message }), code: 'FINANCY_SAVE_FAILED' },
      { status: 500 }
    )
  }

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: 'FINANCY_CONNECT',
    entityType: 'client',
    entityId: auth.ctx.clientId,
    newValues: {
      financy_user_id: creds.userId,
      financy_client_id: creds.clientId,
      connection_count: connectionCount,
    },
  })

  return NextResponse.json({
    ok: true,
    connected: true,
    connection_count: connectionCount,
    message:
      connectionCount > 0
        ? `מחובר — ${connectionCount} חיבורי בנק/כרטיס ב־Financy`
        : 'מפתחות נשמרו. חברו בנק ב־Financy Settings ואז סנכרנו.',
  })
}

/** Disconnect Financy for this tenant (clears credentials + disables). */
export async function DELETE() {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyBankSyncEnabled()) {
    return NextResponse.json(
      { error: 'חשבון בנק כבוי בפלטפורמה', code: 'FINANCY_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'bank-financy-disconnect'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const { data: prev } = await admin
    .from('clients')
    .select('financy_client_id, financy_user_id, financy_client_secret')
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  if (prev?.financy_client_id && prev?.financy_user_id && prev?.financy_client_secret) {
    clearFinancyTokenCache({
      clientId: prev.financy_client_id,
      clientSecret: prev.financy_client_secret,
      userId: prev.financy_user_id,
    })
  }

  const { error } = await admin
    .from('clients')
    .update({
      financy_enabled: false,
      financy_client_id: null,
      financy_client_secret: null,
      financy_user_id: null,
    })
    .eq('id', auth.ctx.clientId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: 'FINANCY_DISCONNECT',
    entityType: 'client',
    entityId: auth.ctx.clientId,
    newValues: { financy_enabled: false },
  })

  return NextResponse.json({ ok: true, connected: false })
}
