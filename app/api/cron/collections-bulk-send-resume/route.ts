import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { resumeStaleCollectionBulkSendRuns } from '@/lib/collection-bulk-send'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = getSupabaseAdmin()
  try {
    const resumed = await resumeStaleCollectionBulkSendRuns(admin, {
      staleMinutes: 5,
      limit: 10,
    })
    return NextResponse.json({ ok: true, resumed })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'resume failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
