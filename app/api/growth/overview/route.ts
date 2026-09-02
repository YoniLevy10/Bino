import { NextResponse } from 'next/server'
import { requireMbrainSession } from '@/lib/mbrain/auth'
import { rollupKpis } from '@/lib/mbrain/meta/insights'
import { getMetaDataLabel, getMetaMode } from '@/lib/mbrain/meta/client'

/** North-star growth overview: demos / ₪ + funnel counts (never fabricate). */
export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const { admin, organizationId } = auth.ctx

  const [
    leadsRes,
    demosRes,
    goalsRes,
    plansRes,
    learningsRes,
    conversionsRes,
    snapsRes,
    tasksRes,
  ] = await Promise.all([
    admin
      .from('growth_leads')
      .select('id, score_band, status', { count: 'exact' })
      .eq('organization_id', organizationId),
    admin
      .from('growth_leads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'demo_booked'),
    admin
      .from('growth_goals')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('growth_plans')
      .select('id, status, estimated_budget, created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'pending_approval'),
    admin
      .from('growth_learnings')
      .select('id, statement, category, status')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('growth_conversions')
      .select('event_type')
      .eq('organization_id', organizationId),
    admin
      .from('mbrain_performance_snapshots')
      .select('spend, leads, impressions, clicks, data_source')
      .eq('organization_id', organizationId)
      .eq('level', 'campaign'),
    admin
      .from('growth_tasks')
      .select('id, title, status, task_type, requires_approval')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .limit(10),
  ])

  const leads = leadsRes.data ?? []
  const hot = leads.filter((l) => l.score_band === 'hot').length
  const warm = leads.filter((l) => l.score_band === 'warm').length
  const qualified = leads.filter((l) =>
    ['qualified', 'contacted', 'replied', 'demo_booked', 'customer'].includes(l.status)
  ).length
  const demos = demosRes.count ?? 0

  const snaps = snapsRes.data ?? []
  const rolled = snaps.length ? rollupKpis(snaps) : null
  const spend = rolled?.spend ?? null
  const northStar =
    spend != null && spend > 0 && demos > 0 ? demos / spend : demos > 0 && (spend == null || spend === 0) ? null : null

  const conv = conversionsRes.data ?? []
  const funnel = {
    lead: conv.filter((c) => c.event_type === 'lead').length,
    qualified: conv.filter((c) => c.event_type === 'qualified').length,
    demo_booked: conv.filter((c) => c.event_type === 'demo_booked').length + demos,
    customer: conv.filter((c) => c.event_type === 'customer').length,
  }

  const recommendations: string[] = []
  if ((plansRes.data ?? []).length > 0) {
    recommendations.push('יש תוכניות Growth ממתינות לאישור')
  }
  if (leads.length === 0) {
    recommendations.push('הוסיפו לידים ראשונים או הריצו איתור מחברות ניהול')
  } else if (hot + warm === 0) {
    recommendations.push('אין לידים חמים — שפרו העשרה/ניקוד לפני אאוטבאונד')
  }
  if (demos === 0 && qualified > 0) {
    recommendations.push('יש לידים מותאמים בלי דמו — הפעילו רצף פנייה או הצעה חדשה')
  }
  if ((learningsRes.data ?? []).length === 0) {
    recommendations.push('תעדו למידה ראשונה אחרי הניסוי הראשון')
  }

  return NextResponse.json({
    meta: { mode: getMetaMode(), label: getMetaDataLabel() },
    northStar: {
      metric: 'qualified_demos_per_ils',
      value: northStar,
      demos,
      spend,
      noteHe:
        spend == null
          ? 'אין עדיין הוצאת מדיה מסונכרנת — צפון הכוכב יופיע אחרי Insights.'
          : demos === 0
            ? 'יש הוצאה בלי דמואים מתועדים עדיין.'
            : `דמואים מותאמים / ₪ = ${(demos / spend).toFixed(4)}`,
    },
    funnel,
    leads: {
      total: leadsRes.count ?? leads.length,
      hot,
      warm,
      qualified,
      demos,
    },
    goals: goalsRes.data ?? [],
    pendingPlans: plansRes.data ?? [],
    pendingTasks: tasksRes.data ?? [],
    learnings: learningsRes.data ?? [],
    recommendationsHe: recommendations,
  })
}
