import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { hasAiGatewayAuth, resolveWhatsAppAiModel } from '@/lib/whatsapp-ai-gateway'
import {
  suggestMaintenanceFromTickets,
  type MaintenanceSuggestion,
  type SuggestTicket,
} from '@/lib/worker-maintenance-suggest'

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function refineWithAi(
  draft: MaintenanceSuggestion,
  lines: string[]
): Promise<Pick<MaintenanceSuggestion, 'title' | 'description' | 'reason'> | null> {
  if (!hasAiGatewayAuth()) return null
  const resolved = resolveWhatsAppAiModel('rewrite')
  if (!resolved) return null
  try {
    const { text } = await generateText({
      model: resolved.model,
      system:
        'אתה עוזר אחזקה לבניינים. החזר JSON בלבד עם המפתחות title, description, reason בעברית. בלי טלפון ובלי שם דייר.',
      prompt:
        `טיוטה:\n${JSON.stringify({
          title: draft.title,
          description: draft.description,
          reason: draft.reason,
        })}\n` +
        `תקלות ששויכו לעובד:\n${lines.join('\n')}\n` +
        'שפר את הניסוח למשימת אחזקה מונעת. title עד 80 תווים.',
      maxOutputTokens: 220,
    })
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      title?: unknown
      description?: unknown
      reason?: unknown
    }
    const title = clip(parsed.title, 200)
    const description = clip(parsed.description, 4000)
    const reason = clip(parsed.reason, 300)
    if (title.length < 2 || description.length < 8) return null
    return { title, description, reason: reason || draft.reason }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-maintenance-suggest')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות' }, { status: 429 })
    }

    const token = sanitizeId(req.nextUrl.searchParams.get('token'))
    const worker = await resolveWorkerFromToken(token || '')
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const { data, error } = await admin
      .from('tickets')
      .select('id, ticket_number, description, project_id, created_at, projects(name)')
      .eq('client_id', worker.client_id)
      .eq('assigned_worker_id', worker.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(40)

    if (error) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

    const { data: projectRows } = await admin
      .from('projects')
      .select('id, name')
      .eq('client_id', worker.client_id)
      .order('name')
      .limit(80)

    const tickets: SuggestTicket[] = (data || []).map((row) => {
      const project = Array.isArray(row.projects) ? row.projects[0] : row.projects
      return {
        id: row.id as string,
        ticket_number: typeof row.ticket_number === 'number' ? row.ticket_number : null,
        description: (row.description as string | null) ?? null,
        project_id: (row.project_id as string | null) ?? null,
        project_name: project?.name ?? null,
        created_at: row.created_at as string,
      }
    })

    const projects = new Map<string, string>()
    for (const row of projectRows || []) {
      if (row.id && row.name) projects.set(row.id as string, row.name as string)
    }
    for (const ticket of tickets) {
      if (ticket.project_id && ticket.project_name) projects.set(ticket.project_id, ticket.project_name)
    }

    const draft = suggestMaintenanceFromTickets(tickets)
    let suggestion = draft
    if (draft) {
      const lines = tickets
        .filter((ticket) => ticket.project_id === draft.project_id)
        .slice(0, 8)
        .map((ticket) => `#${ticket.ticket_number ?? ''} ${(ticket.description || '').slice(0, 120)}`)
      const refined = await refineWithAi(draft, lines)
      if (refined) suggestion = { ...draft, ...refined }
    }

    return NextResponse.json({
      suggestion,
      projects: [...projects.entries()].map(([id, name]) => ({ id, name })),
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
