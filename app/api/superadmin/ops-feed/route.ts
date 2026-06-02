import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export async function GET(req: Request) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const url = new URL(req.url)
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  )

  const admin = getSupabaseAdmin()

  const [failedRes, errorsRes, clientsRes] = await Promise.all([
    admin
      .from('failed_notifications')
      .select('id, client_id, channel, destination, error_message, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    admin
      .from('error_logs')
      .select('id, client_id, context, message, details, resolved, resolved_at, whatsapp_attempts, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    admin.from('clients').select('id, name'),
  ])

  if (failedRes.error) {
    return NextResponse.json({ error: failedRes.error.message }, { status: 500 })
  }
  if (errorsRes.error) {
    return NextResponse.json({ error: errorsRes.error.message }, { status: 500 })
  }

  const clientNameById = new Map<string, string>()
  for (const c of clientsRes.data ?? []) {
    clientNameById.set(c.id, c.name)
  }

  const failed_notifications = (failedRes.data ?? []).map((row) => ({
    ...row,
    client_name: row.client_id ? clientNameById.get(row.client_id) ?? null : null,
  }))

  const error_logs = (errorsRes.data ?? []).map((row) => ({
    ...row,
    client_name: row.client_id ? clientNameById.get(row.client_id) ?? null : null,
  }))

  const unresolved_errors = error_logs.filter((r) => !r.resolved).length

  return NextResponse.json({
    failed_notifications,
    error_logs,
    counts: {
      failed_notifications: failed_notifications.length,
      error_logs: error_logs.length,
      unresolved_errors,
    },
  })
}
