import type { SidebarNavItemId } from '@/lib/sidebar-nav'

export type ProjectRow = {
  id: string
  name: string
  project_code: string
}

/** Matches GET /api/superadmin/stats client rows. */
export type ClientRow = {
  id: string
  name: string
  plan_tier: string
  whatsapp_phone_number_id: string | null
  manager_phone: string | null
  sms_sender_name: string | null
  logo_url: string | null
  admin_email: string | null
  enabled_nav_features: SidebarNavItemId[] | null
  max_workers: number | null
  buildings_allowed: number | null
  max_tickets_per_month: number | null
  workers_active_count: number
  workers_total_count: number
  buildings_count: number
  residents_count: number
  open_tickets_count: number
  projects: ProjectRow[]
}

/** Subset of plan pricing catalog used for effective limits. */
export type PlanCatalogRow = {
  plan_tier: string
  buildings_max: number | null
  workers_max: number | null
  tickets_per_month_max: number | null
}

export type EditState = {
  name: string
  plan_tier: string
  whatsapp_phone_number_id: string
  manager_phone: string
  sms_sender_name: string
  max_workers: string
  buildings_allowed: string
  max_tickets_per_month: string
}

export type TabMode = 'clients' | 'ops' | 'usage' | 'settings'

export type ClientTask =
  | 'hub'
  | 'plan'
  | 'nav'
  | 'addons'
  | 'buildings'
  | 'attendance'
  | 'invite'
  | 'logo'
  | 'recover'
  | 'delete'

export type ClientFilter = 'all' | 'open_tickets' | 'no_whatsapp' | 'at_worker_limit'

export const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
}

export const PLAN_COLORS: Record<string, string> = {
  starter: '#6b7280',
  pro: '#2563eb',
  business: '#7c3aed',
  enterprise: '#b45309',
}
