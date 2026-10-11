import type { ManagementRecommendationRow, Urgency } from '@/lib/recommendations/types'
import type { TenantOpsSnapshot } from '@/lib/ops-context/tenant-snapshot'

export type OpsBriefingPriority = {
  label: string
  href: string
  urgency: Urgency
  domain: 'tickets' | 'maintenance' | 'collections' | 'grow' | 'building'
}

/** One cross-page conclusion for the manager dashboard. */
export type OpsBriefing = {
  headline: string
  summary: string
  priorities: OpsBriefingPriority[]
  /** Which product areas fed this conclusion */
  domains: OpsBriefingPriority['domain'][]
  quiet: boolean
}

function urgencyRank(u: Urgency): number {
  if (u === 'critical') return 0
  if (u === 'high') return 1
  if (u === 'medium') return 2
  return 3
}

/**
 * Turn snapshot + ranked recommendations into a short Hebrew ops conclusion.
 * Heuristic (no LLM) — same product surface managers call “AI recommendations”.
 */
export function synthesizeOpsBriefing(
  snapshot: TenantOpsSnapshot,
  recommendations: ManagementRecommendationRow[] = []
): OpsBriefing {
  const priorities: OpsBriefingPriority[] = []
  const domains = new Set<OpsBriefingPriority['domain']>()

  if (snapshot.tickets.agingUnassigned > 0) {
    priorities.push({
      label: `${snapshot.tickets.agingUnassigned} תקלות בלי שיוך מעל 48 שעות`,
      href: '/tickets?status=open',
      urgency: snapshot.tickets.agingUnassigned >= 3 ? 'critical' : 'high',
      domain: 'tickets',
    })
    domains.add('tickets')
  } else if (snapshot.tickets.unassigned > 0) {
    priorities.push({
      label: `${snapshot.tickets.unassigned} תקלות פתוחות בלי שיוך`,
      href: '/tickets?status=open',
      urgency: 'medium',
      domain: 'tickets',
    })
    domains.add('tickets')
  }

  if (snapshot.tickets.recurringOpen > 0) {
    const hot = snapshot.hotProjects.find((p) => p.recurringOpen > 0)
    priorities.push({
      label: hot
        ? `${snapshot.tickets.recurringOpen} תקלות חוזרות — בעיקר ב${hot.name}`
        : `${snapshot.tickets.recurringOpen} תקלות חוזרות פתוחות`,
      href: hot ? `/tickets?project_id=${encodeURIComponent(hot.id)}` : '/tickets',
      urgency: snapshot.tickets.recurringOpen >= 3 ? 'high' : 'medium',
      domain: 'building',
    })
    domains.add('building')
    domains.add('tickets')
  }

  if (snapshot.maintenance.overdue > 0) {
    priorities.push({
      label: `${snapshot.maintenance.overdue} משימות תחזוקה באיחור`,
      href: '/tasks',
      urgency: snapshot.maintenance.overdue >= 5 ? 'high' : 'medium',
      domain: 'maintenance',
    })
    domains.add('maintenance')
  }

  if (snapshot.collections.enabled) {
    if (snapshot.collections.growBuildingsMissing > 0) {
      priorities.push({
        label: `חסר Grow ב-${snapshot.collections.growBuildingsMissing} בניינים`,
        href: '/settings?tab=grow',
        urgency: 'high',
        domain: 'grow',
      })
      domains.add('grow')
      domains.add('collections')
    }
    if (snapshot.collections.sendFailed > 0) {
      priorities.push({
        label: `${snapshot.collections.sendFailed} חיובים שנכשלו בשליחה`,
        href: '/collections?status=failed',
        urgency: 'high',
        domain: 'collections',
      })
      domains.add('collections')
    } else if (snapshot.collections.drafts > 0) {
      priorities.push({
        label: `${snapshot.collections.drafts} חיובים מוכנים לשליחה`,
        href: '/collections?status=draft',
        urgency: 'medium',
        domain: 'collections',
      })
      domains.add('collections')
    } else if (snapshot.collections.sentUnpaid > 0) {
      priorities.push({
        label: `${snapshot.collections.sentUnpaid} חיובים ממתינים לתשלום`,
        href: '/collections?status=sent',
        urgency: 'low',
        domain: 'collections',
      })
      domains.add('collections')
    }
  }

  // Cross-page: hot building with Grow gap
  if (snapshot.collections.enabled && snapshot.collections.growBuildingsMissing > 0) {
    const hot = snapshot.hotProjects[0]
    if (hot && hot.openTickets >= 3) {
      priorities.push({
        label: `${hot.name}: הרבה תקלות פתוחות — בדקו גם חיבור Grow לגבייה`,
        href: `/collections?project_id=${encodeURIComponent(hot.id)}`,
        urgency: 'medium',
        domain: 'building',
      })
      domains.add('building')
    }
  }

  // Fold top recommendation reasons if still thin
  for (const row of recommendations.slice(0, 4)) {
    if (priorities.length >= 5) break
    const href = row.primary_action_href || '/dashboard'
    const already = priorities.some((p) => p.href === href && p.label === row.reason)
    if (already) continue
    const type = String(row.recommendation_type)
    let domain: OpsBriefingPriority['domain'] = 'tickets'
    if (type.startsWith('collections') || type.includes('collection')) domain = 'collections'
    else if (type.includes('maintenance')) domain = 'maintenance'
    else if (type.includes('building') || type.includes('topic')) domain = 'building'
    priorities.push({
      label: row.reason,
      href,
      urgency: (row.urgency as Urgency) || 'medium',
      domain,
    })
    domains.add(domain)
  }

  priorities.sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency))
  const top = priorities.slice(0, 4)

  if (top.length === 0) {
    return {
      headline: 'המערכת שקטה יחסית',
      summary:
        'אין חריגות חמות מתקלות, תחזוקה או גבייה. אפשר להתמקד בעבודה השוטפת.',
      priorities: [],
      domains: [],
      quiet: true,
    }
  }

  const domainLabels: Record<OpsBriefingPriority['domain'], string> = {
    tickets: 'תקלות',
    maintenance: 'תחזוקה',
    collections: 'גבייה',
    grow: 'Grow',
    building: 'בניינים',
  }
  const domainList = [...domains].map((d) => domainLabels[d]).join(' · ')

  const lead = top[0]
  const headline =
    lead.urgency === 'critical' || lead.urgency === 'high'
      ? `דחוף: ${lead.label}`
      : `מה חשוב עכשיו: ${lead.label}`

  const rest = top.slice(1).map((p) => p.label)
  const summary =
    rest.length > 0
      ? `מסקנה מכל המסכים (${domainList}): ${lead.label}. בנוסף: ${rest.join(' · ')}.`
      : `מסקנה מכל המסכים (${domainList}): ${lead.label}.`

  return {
    headline,
    summary,
    priorities: top,
    domains: [...domains],
    quiet: false,
  }
}
