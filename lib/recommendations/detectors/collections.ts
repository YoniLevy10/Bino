import type { SupabaseClient } from '@supabase/supabase-js'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { clientHasPaidAddon } from '@/lib/paid-addons'
import { buildDedupeKey } from '../dedupe'
import { CLIENT_COLLECTION_BUCKET_ID, type RecommendationDraft } from '../types'

type ChargeLite = {
  id: string
  status: string
  project_id: string | null
}

function bucketDrafts(
  status: 'draft' | 'failed' | 'sent',
  charges: ChargeLite[],
  projectNames: Map<string, string>
): RecommendationDraft[] {
  if (!charges.length) return []

  const byProject = new Map<string | null, ChargeLite[]>()
  for (const c of charges) {
    const key = c.project_id
    const list = byProject.get(key) || []
    list.push(c)
    byProject.set(key, list)
  }

  // Prefer client-wide summary when many projects; still one row per status for the tenant
  const type =
    status === 'draft'
      ? 'collections_drafts'
      : status === 'failed'
        ? 'collections_send_failed'
        : 'collections_sent_unpaid'

  const total = charges.length
  const reason =
    status === 'draft'
      ? `יש ${total} בקשות תשלום שמוכנות לשליחה.`
      : status === 'failed'
        ? `שליחת ${total} בקשות תשלום נכשלה — לבדוק את הפרטים?`
        : `יש ${total} בקשות שנשלחו ועדיין לא שולמו — לפתוח את הרשימה?`

  const urgency = status === 'failed' ? 'high' : status === 'draft' ? 'medium' : 'low'

  // Single client-level bucket (not "overdue")
  const href = `/collections?status=${status}`
  const projectBreakdown = [...byProject.entries()].map(([pid, list]) => ({
    project_id: pid,
    project_name: pid ? projectNames.get(pid) || null : null,
    count: list.length,
  }))

  return [
    {
      recommendationType: type,
      entityType: 'collection_bucket',
      entityId: CLIENT_COLLECTION_BUCKET_ID,
      dedupeKey: buildDedupeKey(type, CLIENT_COLLECTION_BUCKET_ID),
      urgency,
      reason,
      facts: {
        status,
        count: total,
        project_breakdown: projectBreakdown,
        // Explicit: not overdue — no due_date in schema
        is_overdue_claim: false,
      },
      primaryAction: 'open_list',
      primaryActionHref: href,
      actions: [
        {
          id: 'open_list',
          label: 'פתיחת הרשימה',
          href,
          kind: 'navigate',
          requiresAddon: PAID_ADDON_KEYS.collections,
        },
        { id: 'snooze', label: 'הזכר לי מאוחר יותר', kind: 'snooze' },
      ],
    },
  ]
}

export async function detectCollectionsFollowup(
  admin: SupabaseClient,
  clientId: string
): Promise<RecommendationDraft[]> {
  const has = await clientHasPaidAddon(admin, clientId, PAID_ADDON_KEYS.collections)
  if (!has) return []

  const { data: charges, error } = await admin
    .from('collection_charges')
    .select('id, status, project_id')
    .eq('client_id', clientId)
    .in('status', ['draft', 'failed', 'sent'])
    .limit(2000)

  if (error || !charges?.length) return []

  const projectIds = [
    ...new Set(
      (charges as ChargeLite[])
        .map((c) => c.project_id)
        .filter((id): id is string => !!id)
    ),
  ]
  const nameMap = new Map<string, string>()
  if (projectIds.length) {
    const { data: projects } = await admin
      .from('projects')
      .select('id, name')
      .eq('client_id', clientId)
      .in('id', projectIds)
    for (const p of projects || []) {
      nameMap.set(p.id as string, (p.name as string) || '')
    }
  }

  const rows = charges as ChargeLite[]
  return [
    ...bucketDrafts(
      'draft',
      rows.filter((c) => c.status === 'draft'),
      nameMap
    ),
    ...bucketDrafts(
      'failed',
      rows.filter((c) => c.status === 'failed'),
      nameMap
    ),
    ...bucketDrafts(
      'sent',
      rows.filter((c) => c.status === 'sent'),
      nameMap
    ),
  ]
}
