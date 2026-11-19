import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/auth-api/api-auth'
import { clientHasPaidAddon, PAID_ADDON_KEYS } from '@/lib/addons/paid-addons'
import { loadClientFinancyCredentials } from '@/lib/bank/financy-credentials'
import { loadFinancyReceivablesForCollections } from '@/lib/bank/collections-financy'
import { isFinancyBooksEnabled } from '@/lib/bank/flags'

export const dynamic = 'force-dynamic'

/**
 * Read-only Financy receivables for collections managers.
 * Grow legacy charges remain on existing routes.
 */
export async function GET() {
  if (!isFinancyBooksEnabled()) {
    return NextResponse.json(
      { error: 'ספרים כבויים', code: 'FINANCY_BOOKS_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const hasCollections = await clientHasPaidAddon(
    admin,
    auth.ctx.clientId,
    PAID_ADDON_KEYS.collections
  )
  if (!hasCollections) {
    return NextResponse.json(
      { error: 'תוסף גבייה אינו פעיל', code: 'COLLECTIONS_LOCKED' },
      { status: 403 }
    )
  }

  const loaded = await loadClientFinancyCredentials(admin, auth.ctx.clientId)
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 })
  if (!loaded.enabled || !loaded.creds) {
    return NextResponse.json(
      { error: 'Financy לא מוגדר', code: 'FINANCY_NOT_CONFIGURED' },
      { status: 400 }
    )
  }

  const result = await loadFinancyReceivablesForCollections(loaded.creds)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({
    receivables: result.receivables,
    note: 'קריאה דרך Financy (iCount/Morning וכו׳). Grow נשאר לחיובים ישנים.',
  })
}
