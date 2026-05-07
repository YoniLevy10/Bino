import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function isAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET?.trim()
  if (!secret) return false
  return (req.headers.get('x-admin-secret') ?? '') === secret
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  const [clientsRes, projectsRes, residentsRes, ticketsRes, adminsRes] = await Promise.all([
    admin.from('clients').select('id, name, plan_tier, whatsapp_phone_number_id, manager_phone, sms_sender_name'),
    admin.from('projects').select('id, client_id, name, project_code'),
    admin.from('residents').select('id, client_id').is('deleted_at', null),
    admin.from('tickets').select('id, client_id, status').not('status', 'eq', 'CLOSED'),
    admin.rpc('get_client_admin_emails') as unknown as Promise<{ data: { client_id: string; email: string }[] | null; error: unknown }>,
  ])

  if (clientsRes.error) {
    return NextResponse.json({ error: clientsRes.error.message }, { status: 500 })
  }

  const clients = clientsRes.data ?? []
  const projects = projectsRes.data ?? []
  const residents = residentsRes.data ?? []
  const tickets = ticketsRes.data ?? []
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
    admin_email: adminEmails.find((a) => a.client_id === c.id)?.email ?? null,
    buildings_count: (projectsByClient[c.id] ?? []).length,
    residents_count: residents.filter((r) => r.client_id === c.id).length,
    open_tickets_count: tickets.filter((t) => t.client_id === c.id).length,
    projects: projectsByClient[c.id] ?? [],
  }))

  return NextResponse.json({ clients: rows })
}
