import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { getConfiguredGrowWebhookUrl } from '@/lib/collection-charge-ops'
import {
  CLIENT_GROW_LEGAL_SETTINGS_SELECT,
  getClientGrowPagePath,
  growLegalFromClientRow,
} from '@/lib/client-grow-legal'
import {
  CLIENT_GROW_PAYMENTS_SELECT,
  buildGrowCollectionsAccountStatus,
  isGrowCollectionsConfigured,
  type ClientGrowPaymentsRow,
} from '@/lib/grow-credentials'
import { isGrowPlatformConfigured } from '@/lib/grow-config'
import {
  listClientProjectGrowRows,
  loadProjectGrowRow,
  projectGrowAccountStatus,
  resolveGrowMerchant,
} from '@/lib/project-grow'

/** Per-tenant / per-building Grow account readiness. */
export async function GET(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(
    admin,
    auth.ctx.userId,
    'collections-account-status'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() || ''

  const { data, error } = await admin
    .from('clients')
    .select(`${CLIENT_GROW_PAYMENTS_SELECT}, id, name, ${CLIENT_GROW_LEGAL_SETTINGS_SELECT}`)
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const row = data as ClientGrowPaymentsRow & {
    id: string
    name?: string | null
    grow_legal_business_name?: string | null
    grow_legal_phone?: string | null
    grow_legal_address?: string | null
    grow_legal_email?: string | null
  }

  const clientStatus = buildGrowCollectionsAccountStatus({
    platformConfigured: isGrowPlatformConfigured(),
    enabled: row.grow_enabled === true,
    userId: row.grow_user_id,
  })
  const webhook = getConfiguredGrowWebhookUrl()
  const growLegal = growLegalFromClientRow(row)
  const projects = await listClientProjectGrowRows(admin, auth.ctx.clientId)
  const projectSummaries = projects.map((p) => ({
    id: p.id,
    name: p.name,
    grow_enabled: p.grow_enabled === true,
    grow_user_id: p.grow_user_id || null,
    grow_onboarding_status: p.grow_onboarding_status || null,
    ready: projectGrowAccountStatus(p).ready,
  }))

  let ready = clientStatus.ready
  let message = clientStatus.message
  let merchantSource: 'project' | 'client' | null = clientStatus.ready ? 'client' : null
  let selectedProject: (typeof projectSummaries)[number] | null = null

  if (projectId) {
    const project = await loadProjectGrowRow(admin, auth.ctx.clientId, projectId)
    if (!project) {
      return NextResponse.json({ error: 'בניין לא נמצא' }, { status: 404 })
    }
    selectedProject = {
      id: project.id,
      name: project.name,
      grow_enabled: project.grow_enabled === true,
      grow_user_id: project.grow_user_id || null,
      grow_onboarding_status: project.grow_onboarding_status || null,
      ready: projectGrowAccountStatus(project).ready,
    }
    const resolved = resolveGrowMerchant({
      project,
      client: row,
      projectId,
    })
    if (resolved) {
      ready = true
      merchantSource = resolved.source
      message =
        resolved.source === 'project'
          ? `הבניין מחובר ל-Grow — הכסף נכנס לחשבון של ${project.name || 'הבניין'}.`
          : 'הבניין משתמש בחיבור Grow ברמת הלקוח (גיבוי). מומלץ לחבר חשבון נפרד לבניין.'
    } else {
      ready = false
      merchantSource = null
      message =
        'לבניין אין חשבון Grow. חברו userId לבניין בהגדרות → Grow (או הפעילו חיבור לקוח כגיבוי).'
    }
  } else {
    const anyProjectReady = projectSummaries.some((p) => p.ready)
    if (!clientStatus.ready && anyProjectReady) {
      ready = true
      merchantSource = 'project'
      message =
        'יש בניינים עם חשבון Grow. בחרו בניין בעת יצירת חיוב — הכסף ייכנס לחשבון של אותו בניין.'
    } else if (clientStatus.ready && projectSummaries.length > 0) {
      message =
        'חיבור Grow ברמת הלקוח פעיל כגיבוי. אפשר לחבר חשבון נפרד לכל בניין בהגדרות → Grow.'
    }
  }

  return NextResponse.json({
    ...clientStatus,
    ready,
    message,
    hasOwnAccount:
      isGrowCollectionsConfigured(row) || projectSummaries.some((p) => Boolean(p.grow_user_id)),
    merchant_source: merchantSource,
    webhook_configured: webhook.ok,
    webhook_error: webhook.ok ? null : webhook.error,
    grow_legal_ready: growLegal.ready,
    grow_page_path: getClientGrowPagePath(auth.ctx.clientId),
    settings_path: '/settings?tab=grow',
    projects: projectSummaries,
    selected_project: selectedProject,
    client_fallback_ready: clientStatus.ready,
  })
}
