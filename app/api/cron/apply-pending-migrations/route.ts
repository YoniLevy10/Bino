import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { applyPendingSqlMigrations } from '@/lib/apply-sql-migrations'

export const maxDuration = 60

/** One-shot / maintenance: apply pending SQL migrations (Bearer CRON_SECRET). */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await applyPendingSqlMigrations()
  if (result.error) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json({ success: true, ...result })
}
