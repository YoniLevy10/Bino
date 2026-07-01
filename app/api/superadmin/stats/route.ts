import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'
import { parseEnabledNavFeaturesFromDb } from '@/lib/client-nav-features'

export async function GET(req: Request) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const admin = getSupabaseAdmin()

  const [clientsRes, projectsRes, residentsRes, ticketsRes, workersRes, adminsRes] = await Promise.all([
    admin.from('clients').select('id, name, plan_tier, whatsapp_phone_number_id, manager_phone, sms_sender_name, enabled_nav_features, logo_url, max_workers, buildings_allowed, max_tickets_per_month'),
    admin.from('projects').select('id, client_id, name, project_code'),
    admin.from('residents').select('id, client_id').is('deleted_at', null),
    admin.from('tickets').select('id, client_id, status').not('status', 'eq', 'CLOSED'),
    admin.from('workers').select('id, client_id, is_active').is('deleted_at', null),
    admin.rpc('get_client_admin_emails') as unknown as Promise<{ data: { client_id: string; email: string }[] | null; error: unknown }>,
  ])

  if (clientsRes.error) {
    return NextResponse.json({ error: clientsRes.error.message }, { status: 500 })
  }

  const clients = clientsRes.data ?? []
  const projects = projectsRes.data ?? []
  const residents = residentsRes.data ?? []
  const tickets = ticketsRes.data ?? []
  const workers = workersRes.data ?? []
  const adminEmails: { client_id: string; email: string }[] = adminsRes.data ?? []

  type ProjectRow = { id: string; name: string; project_code: string }
  const projectsByClient: Record<string, ProjectRow[]> = {}
  for (const p of projects) {
    if (!projectsByClient[p.client_id]) projectsByClient[p.client_id] = []
    projectsByClient[p.client_id].push({ id: p.id, name: p.name, project_code: p.project_code })
  }

  const rows = clients.map((c) => ({
    id: c.id,
    name: c.name,
    plan_tier: c.plan_tier,
    whatsapp_phone_number_id: c.whatsapp_phone_number_id ?? null,
    manager_phone: c.manager_phone ?? null,
    sms_sender_name: c.sms_sender_name ?? null,
    logo_url: (c as { logo_url?: string | null }).logo_url ?? null,
    admin_email: adminEmails.find((a) => a.client_id === c.id)?.email ?? null,
    enabled_nav_features: parseEnabledNavFeaturesFromDb(
      (c as { enabled_nav_features?: unknown }).enabled_nav_features
    ),
    max_workers: (c as { max_workers?: number | null }).max_workers ?? null,
    buildings_allowed: (c as { buildings_allowed?: number | null }).buildings_allowed ?? null,
    max_tickets_per_month: (c as { max_tickets_per_month?: number | null }).max_tickets_per_month ?? null,
    workers_active_count: workers.filter((w) => w.client_id === c.id && w.is_active).length,
    workers_total_count: workers.filter((w) => w.client_id === c.id).length,
    buildings_count: (projectsByClient[c.id] ?? []).length,
    residents_count: residents.filter((r) => r.client_id === c.id).length,
    open_tickets_count: tickets.filter((t) => t.client_id === c.id).length,
    projects: projectsByClient[c.id] ?? [],
  }))

  return NextResponse.json({ clients: rows })
}
