/**
 * AI intake for unknown (unregistered) WhatsApp residents.
 * Replaces language→building FSM when WHATSAPP_AI_ENABLED=true + AI Gateway auth.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  decideUnknownResidentAiTurn,
  fallbackUnknownResidentPrompt,
  isWhatsAppAiIntakeEnabled,
  resolveBuildingSearchQuery,
  type AiIntakeBuildingCandidate,
  type AiIntakeDecision,
  type AiIntakeHistoryItem,
} from '@/lib/whatsapp-ai'
import {
  normalizeResidentLang,
  type ResidentLang,
} from '@/lib/whatsapp-bilingual-template'
import {
  acceptTicketDescriptionInSession,
  inferResidentLanguageFromText,
} from '@/lib/whatsapp-intent'
import { getLogger } from '@/lib/logging'
import type { ProjectRow } from '@/lib/whatsapp-interactive'
import {
  extractMetaWaMessageId,
  loadWhatsAppThreadForPhone,
  persistWhatsAppMessage,
} from '@/lib/whatsapp-message-store'
import { saveResidentLanguage } from '@/lib/whatsapp-resident-language'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp-send'
import { isStashRow } from '@/lib/whatsapp-webhook/building-search-stash'
import { readLastReporterProject } from '@/lib/whatsapp-webhook/flow-ticket'
import {
  clearPendingSelection,
  createPendingSelection,
  getPendingSelection,
  searchProjectsByBuilding,
} from '@/lib/whatsapp-webhook/project-selection'
import {
  getActiveSession,
  type SessionRow,
} from '@/lib/whatsapp-webhook/session-expire'

const logger = getLogger()

export type UnknownResidentAiIntakeResult =
  | { kind: 'handled' }
  | {
      kind: 'open_ticket'
      session: SessionRow
      language: ResidentLang
      description: string
    }

export type UnknownResidentAiIntakeArgs = {
  supabaseAdmin: SupabaseClient
  clientId: string
  from: string
  textBody: string
  waCreds?: { phoneNumberId?: string; accessToken?: string }
  decideTurn?: typeof decideUnknownResidentAiTurn
  /** Test seam — defaults to searchProjectsByBuilding */
  searchBuildings?: typeof searchProjectsByBuilding
}

function toCandidate(p: ProjectRow): AiIntakeBuildingCandidate {
  return {
    id: p.id,
    name: p.name,
    address: p.address ?? p.address_en ?? null,
  }
}

function formatBuildingList(projects: ProjectRow[], lang: ResidentLang): string {
  const lines = projects.map((p, i) => {
    const addr = (p.address || p.address_en || '').trim()
    return `${i + 1}. ${p.name}${addr ? ` — ${addr}` : ''}`
  })
  if (lang === 'fr') {
    return `Plusieurs immeubles correspondent :\n${lines.join('\n')}\nRépondez avec le numéro (1, 2, …).`
  }
  if (lang === 'en') {
    return `Several buildings match:\n${lines.join('\n')}\nReply with the number (1, 2, …).`
  }
  return `נמצאו כמה בניינים:\n${lines.join('\n')}\nהשיבו עם מספר האפשרות (1, 2, …).`
}

async function sendAiText(args: {
  supabaseAdmin: SupabaseClient
  clientId: string
  from: string
  text: string
  waCreds?: { phoneNumberId?: string; accessToken?: string }
}): Promise<void> {
  const { supabaseAdmin, clientId, from, text, waCreds } = args
  const body = text.trim()
  if (!body) return
  const result = await sendWhatsAppTextMessage(from, body, waCreds, { clientId })
  void persistWhatsAppMessage(supabaseAdmin, {
    clientId,
    phone: from,
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
): Promise<AiIntakeHistoryItem[]> {
  try {
    const thread = await loadWhatsAppThreadForPhone(supabaseAdmin, clientId, from, 16)
    return (thread.messages || [])
      .slice()
      .reverse()
      .map((m) => {
        const direction = String((m as { direction?: string }).direction || '')
        const body = String((m as { body?: string | null }).body || '').trim()
        return {
          role: (direction === 'out' ? 'assistant' : 'user') as 'user' | 'assistant',
          text: body,
        }
      })
      .filter((h) => h.text.length > 0)
      .slice(-12)
  } catch {
    return []
  }
}

async function createSessionForProject(args: {
  supabaseAdmin: SupabaseClient
  clientId: string
  from: string
  projectId: string
  lang: ResidentLang
}): Promise<SessionRow | null> {
  const { supabaseAdmin, clientId, from, projectId, lang } = args

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
    logger.warn('WEBHOOK', 'AI intake session create failed', { err: error.message })
    return null
  }

  await clearPendingSelection(from, supabaseAdmin, clientId)
  return getActiveSession(from, supabaseAdmin, clientId)
}


/** When the resident replies "1"/"2" and a pending list exists, bind that building even if the model forgot select_project_index. */
function resolveNumericCandidatePick(text: string, candidates: ProjectRow[]): ProjectRow | null {
  const trimmed = text.trim()
  if (!/^\d{1,2}$/.test(trimmed)) return null
  const idx = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(idx) || idx < 1 || idx > candidates.length) return null
  return candidates[idx - 1] ?? null
}


function defaultAskIssuePrompt(lang: ResidentLang, buildingName: string): string {
  if (lang === 'fr') {
    return `Immeuble identifié : ${buildingName}. Décrivez brièvement le problème.`
  }
  if (lang === 'en') {
    return `Building identified: ${buildingName}. Please briefly describe the issue.`
  }
  return `הבניין זוהה: ${buildingName}. כתבו בקצרה מה התקלה.`
}

function looksLikeAskBuildingReply(reply: string): boolean {
  const t = reply.trim().toLowerCase()
  if (!t) return true
  return (
    /כתובת|רחוב|בניין|immeuble|adresse|rue|building|address|street|איזה בניין|מה הכתובת/.test(
      t
    ) && !/תקלה|probl[eè]me|issue|leak|נזיל|תאור|describe|דלת|מעלית/.test(t)
  )
}

/** After a building is bound, reuse resident text as ticket description when the model forgot open_ticket. */
function resolveHostTicketDescription(
  textBody: string,
  selected: ProjectRow,
  decision: AiIntakeDecision
): string | null {
  const fromModel =
    decision.open_ticket && decision.ticket_description?.trim()
      ? decision.ticket_description.trim()
      : null
  if (fromModel && fromModel.length >= 3) return fromModel

  const raw = textBody.trim()
  if (!raw || /^\d{1,2}$/.test(raw)) return null
  if (!acceptTicketDescriptionInSession(raw)) return null

  const compact = raw.replace(/\s+/g, '')
  const name = (selected.name || '').replace(/\s+/g, '')
  const addr = (selected.address || selected.address_en || '').replace(/\s+/g, '')
  if (compact && (compact === name || (addr && compact === addr))) return null

  return raw
}

function resolveSelectedProject(
  decision: AiIntakeDecision,
  candidates: ProjectRow[]
): ProjectRow | null {
  if (decision.select_project_id) {
    const byId = candidates.find((p) => p.id === decision.select_project_id)
    if (byId) return byId
  }
  if (
    decision.select_project_index != null &&
    decision.select_project_index >= 1 &&
    decision.select_project_index <= candidates.length
  ) {
    return candidates[decision.select_project_index - 1] ?? null
  }
  return null
}

/** One AI intake turn for an unknown resident with no active session. */
export async function runUnknownResidentAiIntake(
  args: UnknownResidentAiIntakeArgs
): Promise<UnknownResidentAiIntakeResult> {
  if (!isWhatsAppAiIntakeEnabled()) {
    return { kind: 'handled' }
  }

  const {
    supabaseAdmin,
    clientId,
    from,
    textBody,
    waCreds,
    decideTurn = decideUnknownResidentAiTurn,
    searchBuildings = searchProjectsByBuilding,
  } = args

  const pending = await getPendingSelection(from, supabaseAdmin, clientId)
  let candidates = ((pending?.candidate_projects || []) as ProjectRow[]).filter(
    (p) => !isStashRow(p)
  )

  const lastReporter = await readLastReporterProject(supabaseAdmin, clientId, from)
  const history = await loadHistory(supabaseAdmin, clientId, from)

  let decision =
    (await decideTurn({
      latestUserText: textBody,
      history,
      candidateBuildings: candidates.map(toCandidate),
      activeProject: null,
      lastReporterProject: lastReporter
        ? { id: lastReporter.projectId, name: lastReporter.projectName }
        : null,
    })) || null

  if (!decision) {
    const inferred = inferResidentLanguageFromText(textBody) || 'he'
    decision = fallbackUnknownResidentPrompt(inferred)
  }

  const lang = normalizeResidentLang(decision.language)
  await saveResidentLanguage(supabaseAdmin, clientId, from, lang, null)

  let selected = resolveSelectedProject(decision, candidates)
  if (!selected && candidates.length > 0) {
    selected = resolveNumericCandidatePick(textBody, candidates)
  }

  const searchQuery = resolveBuildingSearchQuery(decision, textBody)

  if (!selected && searchQuery) {
    const results = await searchBuildings(
      searchQuery,
      supabaseAdmin,
      clientId
    )
    candidates = results.slice(0, 10)

    if (candidates.length === 1) {
      selected = candidates[0]
      await clearPendingSelection(from, supabaseAdmin, clientId)
    } else if (candidates.length > 1) {
      await createPendingSelection(from, candidates, supabaseAdmin, clientId, lang)
      const listText = formatBuildingList(candidates, lang)
      const reply = decision.reply.trim()
        ? `${decision.reply.trim()}\n\n${listText}`
        : listText
      await sendAiText({ supabaseAdmin, clientId, from, text: reply, waCreds })
      return { kind: 'handled' }
    } else {
      const notFound =
        lang === 'fr'
          ? "Je n'ai pas trouvé cet immeuble. Envoyez rue + numéro, ou scannez le QR."
          : lang === 'en'
            ? 'I could not find that building. Send street + number, or scan the QR code.'
            : 'לא מצאתי את הבניין. כתבו רחוב ומספר, או סרקו את קוד ה-QR בבניין.'
      await sendAiText({
        supabaseAdmin,
        clientId,
        from,
        text: decision.reply.trim() || notFound,
        waCreds,
      })
      return { kind: 'handled' }
    }
  }

  if (!selected) {
    selected = resolveSelectedProject(decision, candidates)
  }
  if (!selected && candidates.length > 0) {
    selected = resolveNumericCandidatePick(textBody, candidates)
  }

  if (selected) {
    const session = await createSessionForProject({
      supabaseAdmin,
      clientId,
      from,
      projectId: selected.id,
      lang,
    })
    if (!session) {
      await sendAiText({
        supabaseAdmin,
        clientId,
        from,
        text:
          lang === 'en'
            ? 'Technical error. Please try again or scan the building QR.'
            : lang === 'fr'
              ? 'Erreur technique. Réessayez ou scannez le QR.'
              : 'תקלה טכנית. נסו שוב או סרקו את קוד ה-QR בבניין.',
        waCreds,
      })
      return { kind: 'handled' }
    }

    const description = resolveHostTicketDescription(textBody, selected, decision)

    if (description && description.length >= 3) {
      return {
        kind: 'open_ticket',
        session,
        language: lang,
        description,
      }
    }

    const modelReply = decision.reply.trim()
    const askIssue =
      modelReply && !looksLikeAskBuildingReply(modelReply)
        ? modelReply
        : defaultAskIssuePrompt(lang, selected.name)

    await sendAiText({ supabaseAdmin, clientId, from, text: askIssue, waCreds })
    return { kind: 'handled' }
  }

  await sendAiText({
    supabaseAdmin,
    clientId,
    from,
    text: decision.reply,
    waCreds,
  })
  return { kind: 'handled' }
}
