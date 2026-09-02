import { NextResponse } from 'next/server'
import { requireMbrainSession } from '@/lib/mbrain/auth'
import { getMetaDataLabel } from '@/lib/mbrain/meta/client'

/** Daily Hebrew digest for the non-marketer: what happened + what to do. */
export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const { data: recs } = await auth.ctx.admin
    .from('mbrain_optimization_recommendations')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: snaps } = await auth.ctx.admin
    .from('mbrain_performance_snapshots')
    .select('spend, leads, cost_per_lead, data_source, date_start')
    .eq('organization_id', auth.ctx.organizationId)
    .order('date_start', { ascending: false })
    .limit(14)

  const spend = (snaps ?? []).reduce((s, r) => s + Number(r.spend), 0)
  const leads = (snaps ?? []).reduce((s, r) => s + Number(r.leads), 0)
  const anyMock = (snaps ?? []).some((s) => s.data_source === 'mock')

  const summaryHe =
    snaps && snaps.length
      ? `ב־14 הימים האחרונים: הוצאה ≈ ₪${spend.toFixed(0)}, לידים ${leads}${
          leads > 0 ? `, CPL ממוצע ≈ ₪${(spend / leads).toFixed(0)}` : ''
        }. ${recs?.length ? `יש ${recs.length} המלצות פתוחות.` : 'אין המלצות קריטיות כרגע.'}`
      : 'עדיין אין נתוני ביצועים. אחרי השקת קמפיין וסנכרון Insights תקבל כאן סיכום יומי בעברית.'

  return NextResponse.json({
    label: anyMock ? 'MOCK DATA' : getMetaDataLabel(),
    summaryHe,
    recommendations: recs ?? [],
    nextStepsHe: [
      'אשר המלצות שדורשות אישור לפני שינוי תקציב',
      'בדוק קריאייטיבים עם CTR חלש והחלף זווית',
      'שמור על CPL מתחת למגבלה ב־/brain/settings/guardrails',
    ],
  })
}
