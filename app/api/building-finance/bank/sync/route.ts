import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { formatZodError } from '@/lib/errors/format-zod-error'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { isFinancyBankSyncEnabled } from '@/lib/bank/flags'
import { loadClientFinancyCredentials } from '@/lib/bank/financy-credentials'
import { syncFinancyAccountsAndTransactions } from '@/lib/bank/sync-accounts-transactions'
import { refreshConnections } from '@/lib/bank/financy-gateway'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  refresh: z.boolean().optional(),
})

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
    'bank-sync'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const validated = bodySchema.safeParse(raw ?? {})
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const loaded = await loadClientFinancyCredentials(admin, auth.ctx.clientId)
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 500 })
  }
  if (!loaded.enabled || !loaded.creds) {
    return NextResponse.json(
      {
        error: 'Financy לא מוגדר ללקוח זה. חברו ב־Settings של Financy והדביקו מפתחות בהגדרות.',
        code: 'FINANCY_NOT_CONFIGURED',
      },
      { status: 400 }
    )
  }

  let refreshResult: unknown = null
  if (validated.data.refresh) {
    const refreshed = await refreshConnections(loaded.creds)
    refreshResult = refreshed.ok ? refreshed.data : { error: refreshed.error }
  }

  const sync = await syncFinancyAccountsAndTransactions({
    admin,
    clientId: auth.ctx.clientId,
    projectId: validated.data.project_id ?? null,
    creds: loaded.creds,
    dateFrom: validated.data.date_from,
    dateTo: validated.data.date_to,
  })

  return NextResponse.json({
    ok: sync.errors.length === 0,
    ...sync,
    refresh: refreshResult,
  })
}
