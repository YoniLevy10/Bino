import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { formatZodError } from '@/lib/format-zod-error'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { isFinancyTransfersEnabled } from '@/lib/bank/flags'
import { loadClientFinancyCredentials } from '@/lib/bank/financy-credentials'
import { createMerchant, listMerchants } from '@/lib/bank/financy-gateway'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyTransfersEnabled()) {
    return NextResponse.json(
      { error: 'העברות כבויות בפלטפורמה', code: 'FINANCY_TRANSFERS_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const limitRaw = Number(url.searchParams.get('limit') || '50')
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 50

  const admin = getSupabaseAdmin()
  const loaded = await loadClientFinancyCredentials(admin, auth.ctx.clientId)
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 })
  if (!loaded.enabled || !loaded.creds) {
    return NextResponse.json(
      { error: 'Financy לא מוגדר', code: 'FINANCY_NOT_CONFIGURED', merchants: [] },
      { status: 400 }
    )
  }

  const listed = await listMerchants(loaded.creds, { limit, sort: -1 })
  if (!listed.ok) {
    return NextResponse.json({ error: listed.error }, { status: 502 })
  }

  return NextResponse.json({
    merchants: listed.data.items,
    nextPage: listed.data.nextPage ?? null,
  })
}

const createBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    display_name: z.string().max(200).optional(),
    iban: z.string().max(40).optional(),
    bban: z.string().max(40).optional(),
    phone: z.string().max(30).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.iban && !val.bban) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'נדרש IBAN או BBAN למוטב',
      })
    }
  })

/** Save a Financy merchant (payee) for reuse on hosted PIS payments. */
export async function POST(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyTransfersEnabled()) {
    return NextResponse.json(
      { error: 'העברות כבויות בפלטפורמה', code: 'FINANCY_TRANSFERS_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'bank-merchant-create'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const validated = createBodySchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const loaded = await loadClientFinancyCredentials(admin, auth.ctx.clientId)
  if (!loaded.ok || !loaded.creds) {
    return NextResponse.json({ error: 'Financy לא מוגדר' }, { status: 400 })
  }

  const body = validated.data
  const created = await createMerchant(loaded.creds, {
    name: body.name,
    displayName: body.display_name || body.name,
    iban: body.iban?.replace(/\s+/g, '') || undefined,
    bban: body.bban?.replace(/\s+/g, '') || undefined,
    phoneNumber: body.phone || undefined,
  })
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 502 })
  }

  return NextResponse.json({ merchant: created.data })
}
