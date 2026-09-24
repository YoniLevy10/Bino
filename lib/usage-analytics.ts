import type { SupabaseClient } from '@supabase/supabase-js'
import { SIDEBAR_NAV_REGISTRY, type SidebarNavItemId } from '@/lib/sidebar-nav'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { navIdFromPathname } from '@/lib/nav-from-pathname'

export { navIdFromPathname }

export type UsageFeatureKey =
  | SidebarNavItemId
  | 'settings'
  | 'addons'
  | 'whatsapp_bot'
  | 'worker_portal'
  | 'billing'

export type FeatureUsageRow = {
  key: UsageFeatureKey
  label: string
  /** Clients with any historical rows for this feature */
  clients_ever: number
  /** Clients with activity in the lookback window */
  clients_recent: number
  /** Total rows / events (all time or available) */
  total_events: number
  /** Rows / events in lookback window */
  recent_events: number
  /** Rank by recent_events then total_events (1 = most used) */
  rank: number
  /** Heuristic: dead / low / core */
  signal: 'unused' | 'low' | 'active' | 'core'
}

export type ClientUsageRow = {
  client_id: string
  name: string
  plan_tier: string | null
  last_ticket_at: string | null
  active_features: string[]
  unused_enabled_addons: string[]
  counts: Record<string, { total: number; recent: number }>
}

export type UsageAnalyticsReport = {
  generated_at: string
  lookback_days: number
  client_count: number
  features: FeatureUsageRow[]
  clients: ClientUsageRow[]
  page_views: {
    available: boolean
    by_nav: { nav_id: string; label: string; views: number; clients: number }[]
    note: string
  }
  insights: string[]
}

const FEATURE_LABELS: Record<UsageFeatureKey, string> = {
  dashboard: 'לוח בקרה',
  tasks: 'ניהול משימות',
  tickets: 'תקלות',
  projects: 'פרויקטים',
  residents: 'דיירים',
  workers: 'עובדים',
  summary: 'סיכום',
  calendar: 'יומן משרד',
  attendance: 'חתמת עובדים',
  professionals: 'אנשי מקצוע',
  qr: 'קודי QR',
  whatsapp_templates: 'תבניות וואטסאפ',
  pending_residents: 'דיירים ממתינים',
  pilot_sms: 'SMS פיילוט',
  project_documents: 'מסמכי פרויקט',
  whatsapp_inbox: 'תיבת WhatsApp',
  campaigns: 'קמפיינים SMS',
  collections: 'גביית ועד',
  settings: 'הגדרות',
  addons: 'תוספים',
  whatsapp_bot: 'בוט WhatsApp (דיירים)',
  worker_portal: 'פורטל עובד',
  billing: 'חיוב / מנוי',
}

type CountBucket = { total: number; recent: number; clientsTotal: Set<string>; clientsRecent: Set<string> }

function emptyBucket(): CountBucket {
  return { total: 0, recent: 0, clientsTotal: new Set(), clientsRecent: new Set() }
}

function bump(bucket: CountBucket, clientId: string | null | undefined, createdAt: string | null | undefined, sinceIso: string) {
  if (!clientId) return
  bucket.total += 1
  bucket.clientsTotal.add(clientId)
  if (createdAt && createdAt >= sinceIso) {
    bucket.recent += 1
    bucket.clientsRecent.add(clientId)
  }
}

async function loadClientIdCreated(
  admin: SupabaseClient,
  table: string,
  opts?: { deletedNull?: boolean }
): Promise<{ client_id: string; created_at: string | null }[]> {
  try {
    const rows = await fetchAllRows<{ client_id: string; created_at: string | null }>((from, to) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table for analytics scans
      let q = (admin as any).from(table).select('client_id, created_at').range(from, to)
      if (opts?.deletedNull) q = q.is('deleted_at', null)
      return q
    })
    return rows.map((r) => ({
      client_id: String(r.client_id),
      created_at: r.created_at ?? null,
    }))
  } catch {
    return []
  }
}

function signalFor(key: UsageFeatureKey, clientsEver: number, clientsRecent: number, clientCount: number): FeatureUsageRow['signal'] {
  if (key === 'tickets' || key === 'projects' || key === 'whatsapp_bot') {
    if (clientsRecent > 0 || clientsEver > 0) return 'core'
  }
  if (clientsEver === 0) return 'unused'
  if (clientsRecent === 0) return 'low'
  if (clientsRecent / Math.max(clientCount, 1) >= 0.5) return 'core'
  return 'active'
}

export async function buildUsageAnalyticsReport(
  admin: SupabaseClient,
  lookbackDays = 30
): Promise<UsageAnalyticsReport> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
  const sinceIso = since.toISOString()

  const [clientsRes, paidAddonsRes] = await Promise.all([
    admin.from('clients').select('id, name, plan_tier'),
    admin.from('client_paid_addons').select('client_id, addon_key, enabled').eq('enabled', true),
  ])

  const clients = clientsRes.data ?? []
  const clientCount = clients.length
  const clientName = new Map(clients.map((c) => [c.id as string, c.name as string]))
  const clientPlan = new Map(clients.map((c) => [c.id as string, (c.plan_tier as string | null) ?? null]))

  const buckets = new Map<UsageFeatureKey, CountBucket>()
  const ensure = (k: UsageFeatureKey) => {
    if (!buckets.has(k)) buckets.set(k, emptyBucket())
    return buckets.get(k)!
  }

  const perClient = new Map<string, Record<string, { total: number; recent: number }>>()
  const bumpClient = (clientId: string, key: string, createdAt: string | null) => {
    if (!perClient.has(clientId)) perClient.set(clientId, {})
    const row = perClient.get(clientId)!
    if (!row[key]) row[key] = { total: 0, recent: 0 }
    row[key].total += 1
    if (createdAt && createdAt >= sinceIso) row[key].recent += 1
  }

  const ingest = async (
    key: UsageFeatureKey,
    table: string,
    opts?: { deletedNull?: boolean }
  ) => {
    const rows = await loadClientIdCreated(admin, table, opts)
    const b = ensure(key)
    for (const r of rows) {
      bump(b, r.client_id, r.created_at, sinceIso)
      bumpClient(r.client_id, key, r.created_at)
    }
  }

  await Promise.all([
    ingest('tickets', 'tickets', { deletedNull: true }),
    ingest('tasks', 'maintenance_tasks', { deletedNull: true }),
    ingest('projects', 'projects'),
    ingest('residents', 'residents', { deletedNull: true }),
    ingest('workers', 'workers', { deletedNull: true }),
    ingest('calendar', 'calendar_events'),
    ingest('attendance', 'worker_attendance_events'),
    ingest('professionals', 'professionals'),
    ingest('pending_residents', 'pending_resident_join_requests'),
    ingest('pilot_sms', 'project_pilot_sms_runs'),
    ingest('project_documents', 'project_documents'),
    ingest('whatsapp_inbox', 'whatsapp_messages'),
    ingest('campaigns', 'sms_campaign_runs'),
    ingest('collections', 'collection_charges'),
    ingest('whatsapp_bot', 'sessions'),
    ingest('whatsapp_templates', 'whatsapp_templates'),
  ])

  // Worker portal: workers with access_token set count as "enabled"; attendance/chat as usage proxy already covered.
  try {
    const portalWorkers = await fetchAllRows<{ client_id: string; created_at: string | null }>((from, to) =>
      admin
        .from('workers')
        .select('client_id, created_at')
        .not('access_token', 'is', null)
        .is('deleted_at', null)
        .range(from, to)
    )
    const b = ensure('worker_portal')
    for (const r of portalWorkers) {
      bump(b, r.client_id, r.created_at, sinceIso)
      bumpClient(r.client_id, 'worker_portal', r.created_at)
    }
  } catch {
    /* ignore */
  }

  // Page views (may be empty until migration + tracking ship)
  let pageViewsAvailable = false
  const pageByNav = new Map<string, { views: number; clients: Set<string> }>()
  try {
    const views = await fetchAllRows<{ client_id: string; nav_id: string; created_at: string }>((from, to) =>
      admin
        .from('feature_page_views')
        .select('client_id, nav_id, created_at')
        .gte('created_at', sinceIso)
        .range(from, to)
    )
    pageViewsAvailable = true
    for (const v of views) {
      const nav = v.nav_id
      if (!pageByNav.has(nav)) pageByNav.set(nav, { views: 0, clients: new Set() })
      const entry = pageByNav.get(nav)!
      entry.views += 1
      entry.clients.add(v.client_id)
      const key = (nav in FEATURE_LABELS ? nav : null) as UsageFeatureKey | null
      if (key) {
        const b = ensure(key)
        // Page views only affect "recent" tab interest; don't double-count total business rows.
        b.recent += 1
        b.clientsRecent.add(v.client_id)
        bumpClient(v.client_id, `page:${nav}`, v.created_at)
      }
    }
  } catch {
    pageViewsAvailable = false
  }

  const featureKeys = Object.keys(FEATURE_LABELS) as UsageFeatureKey[]
  const featuresUnranked: Omit<FeatureUsageRow, 'rank'>[] = featureKeys.map((key) => {
    const b = buckets.get(key) ?? emptyBucket()
    return {
      key,
      label: FEATURE_LABELS[key],
      clients_ever: b.clientsTotal.size,
      clients_recent: b.clientsRecent.size,
      total_events: b.total,
      recent_events: b.recent,
      signal: signalFor(key, b.clientsTotal.size, b.clientsRecent.size, clientCount),
    }
  })

  featuresUnranked.sort((a, b) => b.recent_events - a.recent_events || b.total_events - a.total_events)
  const features: FeatureUsageRow[] = featuresUnranked.map((f, i) => ({ ...f, rank: i + 1 }))

  const paidByClient = new Map<string, string[]>()
  for (const row of paidAddonsRes.data ?? []) {
    const cid = row.client_id as string
    if (!paidByClient.has(cid)) paidByClient.set(cid, [])
    paidByClient.get(cid)!.push(row.addon_key as string)
  }

  const addonToFeature: Record<string, UsageFeatureKey> = {
    calendar: 'calendar',
    attendance: 'attendance',
    worker_stamp: 'attendance',
    professionals: 'professionals',
    pilot_sms: 'pilot_sms',
    project_documents: 'project_documents',
    whatsapp_inbox: 'whatsapp_inbox',
    campaigns: 'campaigns',
    collections: 'collections',
  }

  const clientRows: ClientUsageRow[] = clients.map((c) => {
    const id = c.id as string
    const counts = perClient.get(id) ?? {}
    const lastTicketAt =
      counts.tickets && counts.tickets.total > 0
        ? null // filled below from tickets scan if needed
        : null
    const active = Object.entries(counts)
      .filter(([, v]) => v.recent > 0)
      .map(([k]) => k)
      .filter((k) => !k.startsWith('page:'))
    const enabledAddons = paidByClient.get(id) ?? []
    const unused_enabled_addons = enabledAddons.filter((addon) => {
      const feat = addonToFeature[addon]
      if (!feat) return false
      const c = counts[feat]
      return !c || c.total === 0
    })
    return {
      client_id: id,
      name: clientName.get(id) ?? id,
      plan_tier: clientPlan.get(id) ?? null,
      last_ticket_at: lastTicketAt,
      active_features: active,
      unused_enabled_addons,
      counts,
    }
  })

  // Enrich last_ticket_at
  try {
    const ticketTimes = await fetchAllRows<{ client_id: string; created_at: string }>((from, to) =>
      admin.from('tickets').select('client_id, created_at').is('deleted_at', null).order('created_at', { ascending: false }).range(from, to)
    )
    const latest = new Map<string, string>()
    for (const t of ticketTimes) {
      if (!latest.has(t.client_id)) latest.set(t.client_id, t.created_at)
    }
    for (const row of clientRows) {
      row.last_ticket_at = latest.get(row.client_id) ?? null
    }
  } catch {
    /* ignore */
  }

  clientRows.sort((a, b) => {
    const aScore = Object.values(a.counts).reduce((s, v) => s + v.recent, 0)
    const bScore = Object.values(b.counts).reduce((s, v) => s + v.recent, 0)
    return bScore - aScore
  })

  const insights: string[] = []
  const unused = features.filter((f) => f.signal === 'unused' && !['dashboard', 'summary', 'qr', 'settings', 'addons', 'billing'].includes(f.key))
  const low = features.filter((f) => f.signal === 'low')
  const top = features.filter((f) => f.recent_events > 0).slice(0, 5)

  if (top.length) {
    insights.push(
      `הכי בשימוש ב-${lookbackDays} הימים האחרונים: ${top.map((f) => `${f.label} (${f.recent_events})`).join(', ')}`
    )
  }
  if (unused.length) {
    insights.push(`פיצ'רים בלי אף רשומה אצל אף לקוח: ${unused.map((f) => f.label).join(', ')}`)
  }
  if (low.length) {
    insights.push(`פיצ'רים עם נתונים היסטוריים אבל בלי פעילות בחלון: ${low.map((f) => f.label).join(', ')}`)
  }
  const paidUnusedClients = clientRows.filter((c) => c.unused_enabled_addons.length > 0)
  if (paidUnusedClients.length) {
    insights.push(
      `${paidUnusedClients.length} לקוחות עם תוסף בתשלום מופעל בלי שימוש בפועל (שווה לבדוק / לבטל)`
    )
  }
  if (!pageViewsAvailable) {
    insights.push('מעקב כניסות ללשוניות עדיין לא פעיל ב-DB — אחרי המיגרציה יופיעו נתוני tab views אמיתיים')
  } else if ([...pageByNav.values()].every((v) => v.views === 0)) {
    insights.push('טבלת page views קיימת אבל ריקה — הנתונים יתמלאו כשמשתמשים יגלשו בדשבורד')
  }

  const page_views = {
    available: pageViewsAvailable,
    by_nav: [...pageByNav.entries()]
      .map(([nav_id, v]) => ({
        nav_id,
        label:
          FEATURE_LABELS[nav_id as UsageFeatureKey] ??
          SIDEBAR_NAV_REGISTRY[nav_id as SidebarNavItemId]?.label ??
          nav_id,
        views: v.views,
        clients: v.clients.size,
      }))
      .sort((a, b) => b.views - a.views),
    note: pageViewsAvailable
      ? `צפיות בדשבורד ב-${lookbackDays} הימים האחרונים`
      : 'נדרשת מיגרציה 084_feature_page_views',
  }

  return {
    generated_at: new Date().toISOString(),
    lookback_days: lookbackDays,
    client_count: clientCount,
    features,
    clients: clientRows,
    page_views,
    insights,
  }
}
