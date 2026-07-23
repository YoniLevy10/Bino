import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientIdWithNavFeature } from '@/lib/api-nav-guard'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { syncWorkersToOfficeStaff } from '@/lib/office-attendance'

/** Import active workers (עובדים) into office_staff for QR station clock-in. */
export async function POST() {
  try {
    const auth = await requireSessionClientIdWithNavFeature('attendance', 'manager')
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'attendance-sync-workers')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const result = await syncWorkersToOfficeStaff(auth.ctx.clientId)
    return NextResponse.json({
      ok: true,
      added: result.added,
      total: result.total,
      message:
        result.added > 0
          ? `נוספו ${result.added} עובדים לרשימת ההחתמה`
          : 'כל העובדים כבר ברשימה — לא נוספו שמות חדשים',
    })
  } catch (e) {
    console.error('[attendance/office-staff/sync-workers]', e)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
