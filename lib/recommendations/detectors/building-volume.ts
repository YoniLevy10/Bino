import type { SupabaseClient } from '@supabase/supabase-js'
import { matchTicketTopic } from '../topic-keywords'
import { buildDedupeKey } from '../dedupe'
import type { RecommendationDraft } from '../types'

const WINDOW_DAYS = 30
const VOLUME_THRESHOLD = 7
const TOPIC_THRESHOLD = 3

export async function detectBuildingVolumeAndTopics(
  admin: SupabaseClient,
  clientId: string
): Promise<RecommendationDraft[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()

  const { data: tickets, error } = await admin
    .from('tickets')
    .select('id, project_id, description, created_at, ticket_number')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .gte('created_at', since)
    .limit(1000)

  if (error || !tickets?.length) return []

  const byProject = new Map<string, typeof tickets>()
  for (const t of tickets) {
    const pid = t.project_id as string
    if (!pid) continue
    const list = byProject.get(pid) || []
    list.push(t)
    byProject.set(pid, list)
  }

  const projectIds = [...byProject.keys()]
  const { data: projects } = await admin
    .from('projects')
    .select('id, name, project_code')
    .eq('client_id', clientId)
    .in('id', projectIds)

  const nameMap = new Map((projects || []).map((p) => [p.id as string, (p.name as string) || '']))
  const codeMap = new Map(
    (projects || []).map((p) => [p.id as string, ((p.project_code as string) || '').trim()])
  )

  const drafts: RecommendationDraft[] = []

  for (const [projectId, list] of byProject) {
    const projectName = nameMap.get(projectId) || 'בניין'
    const projectCode = codeMap.get(projectId) || ''
    const ticketsHref = projectCode
      ? `/tickets?project=${encodeURIComponent(projectCode)}`
      : `/tickets?project_id=${projectId}`
    const ticketIds = list.map((t) => t.id as string)

    if (list.length >= VOLUME_THRESHOLD) {
      drafts.push({
        recommendationType: 'building_ticket_volume',
        entityType: 'project',
        entityId: projectId,
        dedupeKey: buildDedupeKey('building_ticket_volume', projectId),
        urgency: list.length >= 12 ? 'high' : 'medium',
        reason: `נפתחו ${list.length} קריאות בבניין ${projectName} בחודש האחרון. כדאי לבדוק אם נדרש טיפול מרוכז.`,
        facts: {
          project_name: projectName,
          project_code: projectCode || null,
          ticket_count: list.length,
          window_days: WINDOW_DAYS,
          min_count: VOLUME_THRESHOLD,
          ticket_ids: ticketIds.slice(0, 50),
        },
        primaryAction: 'view_tickets',
        primaryActionHref: ticketsHref,
        actions: [
          {
            id: 'view_tickets',
            label: 'צפייה בקריאות הרלוונטיות',
            href: ticketsHref,
            kind: 'navigate',
          },
          {
            id: 'create_maintenance_task',
            label: 'יצירת משימת אחזקה',
            href: `/tasks?create=1&project_id=${projectId}&from_tickets=${ticketIds.slice(0, 20).join(',')}`,
            kind: 'create_task',
          },
          { id: 'dismiss', label: 'דחיית ההמלצה', kind: 'dismiss' },
          { id: 'snooze', label: 'הזכר לי מאוחר יותר', kind: 'snooze' },
        ],
      })
    }

    // Topic recurrence — consistent topic key only (not same reporter)
    const byTopic = new Map<string, { label: string; ids: string[] }>()
    for (const t of list) {
      const match = matchTicketTopic(t.description as string | null)
      if (!match) continue
      const cur = byTopic.get(match.topicKey) || { label: match.labelHe, ids: [] }
      cur.ids.push(t.id as string)
      byTopic.set(match.topicKey, cur)
    }

    for (const [topicKey, info] of byTopic) {
      if (info.ids.length < TOPIC_THRESHOLD) continue
      drafts.push({
        recommendationType: 'building_topic_recurrence',
        entityType: 'project',
        entityId: projectId,
        dedupeKey: buildDedupeKey('building_topic_recurrence', projectId, topicKey),
        urgency: 'medium',
        reason: `נפתחו ${info.ids.length} קריאות בנושא ${info.label} בבניין ${projectName} בחודש האחרון. כדאי לבדוק טיפול מונע.`,
        facts: {
          project_name: projectName,
          project_code: projectCode || null,
          topic_key: topicKey,
          topic_label: info.label,
          ticket_count: info.ids.length,
          window_days: WINDOW_DAYS,
          min_count: TOPIC_THRESHOLD,
          ticket_ids: info.ids.slice(0, 50),
          // Explicit: not a structural diagnosis
          structural_claim: false,
        },
        primaryAction: 'view_tickets',
        primaryActionHref: ticketsHref,
        actions: [
          {
            id: 'view_tickets',
            label: 'צפייה בקריאות הרלוונטיות',
            href: ticketsHref,
            kind: 'navigate',
          },
          {
            id: 'create_maintenance_task',
            label: 'יצירת משימת אחזקה',
            href: `/tasks?create=1&project_id=${projectId}&topic=${encodeURIComponent(info.label)}&from_tickets=${info.ids.slice(0, 20).join(',')}`,
            kind: 'create_task',
          },
          { id: 'dismiss', label: 'דחיית ההמלצה', kind: 'dismiss' },
          { id: 'snooze', label: 'הזכר לי מאוחר יותר', kind: 'snooze' },
        ],
      })
    }
  }

  return drafts
}
