/**
 * Structured turn for the opt-in WhatsApp chatbot.
 * The model proposes an action. The server executes only reply, a real
 * resident-portal link, or a ticket description for the existing open path.
 */
import { generateText } from 'ai'
import type { ResidentLang } from '@/lib/whatsapp-bilingual-template'
import { normalizeResidentLang } from '@/lib/whatsapp-bilingual-template'
import { acceptTicketDescriptionInSession } from '@/lib/whatsapp-intent'
import { resolveWhatsAppAiModel } from '@/lib/whatsapp-ai-gateway'

export type AiChatAction = 'reply' | 'portal_link' | 'open_ticket'

export type AiChatDecision = {
  reply: string
  language: ResidentLang
  action: AiChatAction
  ticket_description: string | null
  search_query: string | null
}

export type AiChatHistoryItem = {
  role: 'user' | 'assistant'
  text: string
}

export type AiChatPromptInput = {
  latestUserText: string
  history: AiChatHistoryItem[]
  residentName: string | null
  projectName: string | null
  projectKnown: boolean
}

const CHAT_SYSTEM = `אתה נציג WhatsApp של Bino, מערכת תחזוקת בניינים.
דבר בשפת הדייר (עברית, צרפתית, אנגלית, או השפה שבה פנה). הודעות קצרות, עד 3 משפטים, טון חם ומקצועי.
תפקידך בקצה: לפתוח תקלה. בנוסף מותר רק לבקש קישור לאזור הדיירים.

חוקים:
- אל תמציא קישורים, כתובות, מספרי תקלה או בניינים.
- אל תכלול URL בתשובה. השרת מוסיף קישור אמיתי רק כש-action=portal_link.
- ברכה או שיחת חולין: action=reply, בלי לפתוח תקלה.
- בקשה לאזור דיירים / לינק / פורטל: action=portal_link.
- תיאור תקלה: action=open_ticket ו-ticket_description עם תיאור קצר.
- אם אין בניין מזוהה והדייר נתן רחוב או שם בניין: search_query עם הטקסט לחיפוש.
- החזר JSON בלבד, בלי markdown.`

export function stripModelUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  return (fenced?.[1] ?? trimmed).trim()
}

export function parseAiChatDecision(
  raw: string,
  fallbackLang: ResidentLang = 'he'
): AiChatDecision | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>
    const language = normalizeResidentLang(
      typeof parsed.language === 'string' ? parsed.language : fallbackLang
    )
    const actionRaw = String(parsed.action ?? 'reply')
    const action: AiChatAction =
      actionRaw === 'portal_link' || actionRaw === 'open_ticket' ? actionRaw : 'reply'
    const reply = stripModelUrls(String(parsed.reply ?? ''))
    const ticket_description = parsed.ticket_description
      ? stripModelUrls(String(parsed.ticket_description)) || null
      : null
    const search_query = parsed.search_query
      ? String(parsed.search_query).trim() || null
      : null
    if (!reply && action === 'reply') return null
    return { reply, language, action, ticket_description, search_query }
  } catch {
    return null
  }
}

export function needBuildingReply(lang: ResidentLang): string {
  if (lang === 'fr') {
    return "Pour continuer, indiquez l'adresse de l'immeuble (rue et numéro)."
  }
  if (lang === 'en') {
    return 'To continue, please send the building address (street and number).'
  }
  return 'כדי להמשיך כתבו את כתובת הבניין (רחוב ומספר).'
}

export function needIssueReply(lang: ResidentLang, buildingName: string): string {
  if (lang === 'fr') {
    return `Immeuble : ${buildingName}. Décrivez brièvement le problème et j'ouvre la demande.`
  }
  if (lang === 'en') {
    return `Building: ${buildingName}. Briefly describe the problem and I will open the request.`
  }
  return `הבניין: ${buildingName}. כתבו בקצרה מה התקלה ואפתח אותה.`
}

export type ResolvedAiChatTurn =
  | { kind: 'reply'; text: string; language: ResidentLang }
  | { kind: 'open_ticket'; description: string; language: ResidentLang; projectId: string }

/**
 * Server policy. portalUrl is attached only when the server already resolved a project.
 * Model URLs are never forwarded.
 */
export function resolveAiChatTurn(input: {
  decision: AiChatDecision
  latestUserText: string
  project: { id: string; name: string } | null
  portalUrl: string | null
}): ResolvedAiChatTurn {
  const { decision, latestUserText, project, portalUrl } = input
  const lang = decision.language
  const reply = stripModelUrls(decision.reply)

  if (decision.action === 'portal_link') {
    if (project && portalUrl) {
      const intro =
        reply ||
        (lang === 'fr'
          ? 'Voici le lien de l’espace résidents de votre immeuble :'
          : lang === 'en'
            ? 'Here is your building’s resident area:'
            : 'הנה האזור האישי של הדיירים בבניין שלכם:')
      return { kind: 'reply', language: lang, text: `${intro}\n${portalUrl}` }
    }
    return { kind: 'reply', language: lang, text: reply || needBuildingReply(lang) }
  }

  if (decision.action === 'open_ticket') {
    if (!project) {
      return { kind: 'reply', language: lang, text: reply || needBuildingReply(lang) }
    }
    const fromModel = decision.ticket_description?.trim() || ''
    const description = acceptTicketDescriptionInSession(fromModel)
      ? fromModel
      : acceptTicketDescriptionInSession(latestUserText)
        ? latestUserText.trim()
        : null
    if (!description) {
      return {
        kind: 'reply',
        language: lang,
        text: reply || needIssueReply(lang, project.name),
      }
    }
    return {
      kind: 'open_ticket',
      description,
      language: lang,
      projectId: project.id,
    }
  }

  return {
    kind: 'reply',
    language: lang,
    text:
      reply ||
      (lang === 'fr'
        ? 'Comment puis-je aider ? Vous pouvez décrire une panne ou demander le lien résidents.'
        : lang === 'en'
          ? 'How can I help? You can describe a problem or ask for the resident-area link.'
          : 'איך אפשר לעזור? אפשר לתאר תקלה או לבקש את הקישור לאזור הדיירים.'),
  }
}

function buildChatPrompt(input: AiChatPromptInput): string {
  const history =
    input.history.length === 0
      ? '(none)'
      : input.history.map((h) => `${h.role === 'user' ? 'resident' : 'bot'}: ${h.text}`).join('\n')
  return `Latest resident message:
${input.latestUserText}

History (old to new):
${history}

Known resident: ${input.residentName || '(unknown)'}
Known building: ${input.projectKnown ? input.projectName || '(yes)' : '(none)'}

Return JSON:
{
  "reply": string,
  "language": "he" | "fr" | "en",
  "action": "reply" | "portal_link" | "open_ticket",
  "ticket_description": string | null,
  "search_query": string | null
}`
}

export async function decideClientAiChatTurn(
  input: AiChatPromptInput
): Promise<AiChatDecision | null> {
  const resolved = resolveWhatsAppAiModel('chat')
  if (!resolved) return null
  try {
    const { text } = await generateText({
      model: resolved.model,
      system: CHAT_SYSTEM,
      prompt: buildChatPrompt(input),
      maxOutputTokens: 500,
      temperature: 0.3,
      abortSignal: AbortSignal.timeout(12_000),
    })
    if (!text?.trim()) return null
    return parseAiChatDecision(text)
  } catch (e) {
    console.warn(
      '[whatsapp-ai-chat] decision failed:',
      e instanceof Error ? e.message : String(e)
    )
    return null
  }
}
