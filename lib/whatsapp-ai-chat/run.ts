/**
 * Opt-in WhatsApp chatbot for one client.
 * Replies, attaches a server-built resident-portal link, or hands a
 * description to the existing ticket-open path. Never runs unless the gate is on.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getLogger } from '@/lib/logging'
import { getResidentPortalJoinUrl } from '@/lib/public-origin'
import {
  findApprovedResidentByPhoneClient,
  type ResidentRow,
} from '@/lib/residents-whatsapp'
import {
  extractMetaWaMessageId,
  loadWhatsAppThreadForPhone,
  persistWhatsAppMessage,
} from '@/lib/whatsapp-message-store'
import { saveResidentLanguage } from '@/lib/whatsapp-resident-language'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp-send'
import { getActiveSession, type SessionRow } from '@/lib/whatsapp-webhook/session-expire'
import { searchProjectsByBuilding } from '@/lib/whatsapp-webhook/project-selection'
import type { ProjectRow } from '@/lib/whatsapp-interactive'
import type { ResidentLang } from '@/lib/whatsapp-bilingual-template'
import {
  decideClientAiChatTurn,
  needBuildingReply,
  resolveAiChatTurn,
  type AiChatDecision,
  type AiChatHistoryItem,
  type AiChatPromptInput,
} from '@/lib/whatsapp-ai-chat/decision'

const logger = getLogger()

export type ClientAiChatResult =
  | { kind: 'handled' }
  | { kind: 'passthrough' }
  | { kind: 'open_ticket'; description: string; language: ResidentLang }

export type RunClientAiChatArgs = {
  supabaseAdmin: SupabaseClient
  clientId: string
  from: string
  textBody: string
  waCreds?: { phoneNumberId?: string; accessToken?: string }
  decideTurn?: (input: AiChatPromptInput) => Promise<AiChatDecision | null>
  searchBuildings?: typeof searchProjectsByBuilding
  findResident?: typeof findApprovedResidentByPhoneClient
  sendText?: (text: string) => Promise<void>
}

async function defaultSendText(args: {
  supabaseAdmin: SupabaseClient
  clientId: string
  from: string
  text: string
  waCreds?: { phoneNumberId?: string; accessToken?: string }
}): Promise<void> {
  const body = args.text.trim()
  if (!body) return
  const result = await sendWhatsAppTextMessage(args.from, body, args.waCreds, {
    clientId: args.clientId,
  })
  void persistWhatsAppMessage(args.supabaseAdmin, {
    clientId: args.clientId,
    phone: args.from,
    direction: 'out',
    body,
    messageType: 'text',
    waMessageId: extractMetaWaMessageId(result),
  })
}

async function loadHistory(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  from: string
): Promise<AiChatHistoryItem[]> {
  try {
    const thread = await loadWhatsAppThreadForPhone(supabaseAdmin, clientId, from, 12)
    return (thread.messages || [])
      .slice()
      .reverse()
      .map((m) => ({
        role: (String((m as { direction?: string }).direction) === 'out'
          ? 'assistant'
          : 'user') as 'user' | 'assistant',
        text: String((m as { body?: string | null }).body || '').trim(),
      }))
      .filter((h) => h.text.length > 0)
      .slice(-8)
  } catch {
    return []
  }
}

async function loadProject(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  projectId: string
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { id?: string; name?: string | null }
  if (!row.id) return null
  return { id: row.id, name: (row.name || '').trim() || row.id }
}

async function createSession(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  from: string,
  projectId: string,
  lang: ResidentLang
): Promise<SessionRow | null> {
  await supabaseAdmin
    .from('sessions')
    .update({
      is_active: false,
      active_ticket_id: null,
      last_activity_at: new Date().toISOString(),
    })
    .eq('phone_number', from)
    .eq('client_id', clientId)
    .eq('is_active', true)

  const { error } = await supabaseAdmin.from('sessions').insert({
    phone_number: from,
    client_id: clientId,
    project_id: projectId,
    is_active: true,
    active_ticket_id: null,
    preferred_language: lang,
    last_activity_at: new Date().toISOString(),
  })
  if (error) {
    logger.warn('WEBHOOK', 'WhatsApp AI chat session create failed', { err: error.message })
    return null
  }
  return getActiveSession(from, supabaseAdmin, clientId)
}

async function rememberLanguage(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  from: string,
  lang: ResidentLang,
  sessionId: string | null
): Promise<void> {
  try {
    await saveResidentLanguage(supabaseAdmin, clientId, from, lang, sessionId)
  } catch (e) {
    logger.warn('WEBHOOK', 'WhatsApp AI chat language save failed', {
      err: e instanceof Error ? e.message : String(e),
    })
  }
}

function formatBuildingChoices(projects: ProjectRow[], lang: ResidentLang): string {
  const lines = projects.slice(0, 8).map((p, i) => {
    const addr = (p.address || p.address_en || '').trim()
    return `${i + 1}. ${p.name}${addr ? ` — ${addr}` : ''}`
  })
  const head =
    lang === 'fr'
      ? 'Plusieurs immeubles correspondent :'
      : lang === 'en'
        ? 'Several buildings match:'
        : 'נמצאו כמה בניינים:'
  const tail =
    lang === 'fr'
      ? "Répondez avec le nom de l'immeuble."
      : lang === 'en'
        ? 'Reply with the building name.'
        : 'השיבו עם שם הבניין.'
  return `${head}\n${lines.join('\n')}\n${tail}`
}

export async function runClientWhatsAppAiChat(
  args: RunClientAiChatArgs
): Promise<ClientAiChatResult> {
  const {
    supabaseAdmin,
    clientId,
    from,
    textBody,
    waCreds,
    decideTurn = decideClientAiChatTurn,
    searchBuildings = searchProjectsByBuilding,
    findResident = findApprovedResidentByPhoneClient,
  } = args
  const sendText =
    args.sendText ??
    ((text: string) =>
      defaultSendText({ supabaseAdmin, clientId, from, text, waCreds }))

  const text = textBody.trim()
  if (!text) return { kind: 'passthrough' }

  const resident: ResidentRow | null = await findResident(supabaseAdmin, clientId, from)
  let project = resident?.project_id
    ? await loadProject(supabaseAdmin, clientId, resident.project_id)
    : null

  const history = await loadHistory(supabaseAdmin, clientId, from)
  const decision = await decideTurn({
    latestUserText: text,
    history,
    residentName: resident?.full_name?.trim() || null,
    projectName: project?.name ?? null,
    projectKnown: Boolean(project),
  })
  if (!decision) return { kind: 'passthrough' }

  if (!project && decision.search_query) {
    const matches = await searchBuildings(decision.search_query, supabaseAdmin, clientId)
    if (matches.length === 1) {
      project = { id: matches[0].id, name: matches[0].name }
    } else if (matches.length > 1) {
      await sendText(formatBuildingChoices(matches, decision.language))
      await rememberLanguage(supabaseAdmin, clientId, from, decision.language, null)
      return { kind: 'handled' }
    }
  }

  const portalUrl = project ? getResidentPortalJoinUrl(project.id) : null
  const turn = resolveAiChatTurn({
    decision,
    latestUserText: text,
    project,
    portalUrl,
  })

  if (turn.kind === 'reply') {
    const textOut =
      !project && decision.action !== 'reply' && !decision.reply.trim()
        ? needBuildingReply(turn.language)
        : turn.text
    await sendText(textOut)
    await rememberLanguage(supabaseAdmin, clientId, from, turn.language, null)
    return { kind: 'handled' }
  }

  const session = await createSession(
    supabaseAdmin,
    clientId,
    from,
    turn.projectId,
    turn.language
  )
  if (!session?.project_id) {
    await sendText(
      turn.language === 'fr'
        ? 'Erreur technique. Réessayez dans un instant.'
        : turn.language === 'en'
          ? 'Technical error. Please try again in a moment.'
          : 'תקלה טכנית. נסו שוב עוד רגע.'
    )
    return { kind: 'handled' }
  }

  await rememberLanguage(supabaseAdmin, clientId, from, turn.language, session.id)
  return {
    kind: 'open_ticket',
    description: turn.description,
    language: turn.language,
  }
}
