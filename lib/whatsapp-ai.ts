/**
 * AI-powered WhatsApp helpers via Vercel AI Gateway.
 *
 * Enable:
 *   WHATSAPP_AI_ENABLED=true
 *   AI_GATEWAY_API_KEY=…  (or VERCEL_OIDC_TOKEN on Vercel)
 *
 * Intake also respects WHATSAPP_AI_INTAKE_ENABLED
 * (default on when AI enabled; set "false" to keep rewrite-only).
 */
import { generateText } from 'ai'
import { interpolateWhatsAppTemplate } from '@/lib/whatsapp-templates'
import type { ResidentLang } from '@/lib/whatsapp-bilingual-template'
import {
  hasAiGatewayAuth,
  resolveWhatsAppAiModel,
} from '@/lib/whatsapp-ai-gateway'

const REWRITE_SYSTEM = `אתה עוזר WhatsApp של מערכת ניהול בניינים בישראל.
תפקידך לשלוח הודעות קצרות, ידידותיות ומקצועיות לדיירים בעברית.
כללים:
- עברית בלבד
- מקסימום 4 משפטים
- שמור על כל הפרטים החשובים מהתבנית (מספר תקלה, שם פרויקט וכו')
- אל תוסיף ברכות ארוכות
- אמוג'י — רק אם הם בתבנית המקורית`

const INTAKE_SYSTEM = `אתה נציג שירות WhatsApp של במקור (Bamakor) — מערכת דיווח תקלות לבניינים בישראל.
אתה מדבר עם דייר שעדיין לא רשום במערכת. המטרה: לזהות בניין ב-Supabase ולפתוח תקלה.

חוקים קשיחים:
1. השב תמיד בשפת הדייר (עברית / צרפתית / אנגלית). ברירת מחדל עברית.
2. הודעות קצרות וברורות ל-WhatsApp (מקסימום 3 משפטים + רשימה אם צריך).
3. אל תמציא בניינים. אל תניח כתובת שלא נמצאה בחיפוש. החיפוש במסד הנתונים מתבצע רק דרך search_query.
4. אם הדייר כתב שם רחוב / כתובת / מספר בניין / קוד פרויקט — חובה למלא search_query עם הטקסט לחיפוש (גם בלי מספר בית). דוגמה: "חלץ" → search_query="חלץ".
5. אל תבקש שוב "רחוב ומספר" אם כבר יש רמז לכתובת — קודם חפש עם search_query. רק אם החיפוש נכשל אפשר לבקש מספר בית.
6. אם חסר תיאור תקלה — בקש תיאור קצר רק אחרי שיש בניין מזוהה.
7. ברכות (בוקר טוב / היי / שלום) אינן תקלה ואינן כתובת — ענה בנימוס, search_query=null, ובקש כתובת.
8. כשיש כמה בניינים ברשימת המועמדים — השתמש ב-select_project_index או select_project_id. אל תמציא id.
9. כשהדייר עונה רק עם מספר (למשל "2") ויש רשימת מועמדים — חובה select_project_index עם אותו מספר, בלי search_query ובלי לשאול שוב איזה בניין.
10. החזר JSON בלבד לפי הסכמה — בלי markdown ובלי הסברים.`

export function isWhatsAppAiEnabled(): boolean {
  return process.env.WHATSAPP_AI_ENABLED === 'true' && hasAiGatewayAuth()
}

export function isWhatsAppAiIntakeEnabled(): boolean {
  if (process.env.WHATSAPP_AI_INTAKE_ENABLED === 'false') return false
  if (process.env.WHATSAPP_AI_INTAKE_ENABLED === 'true') return isWhatsAppAiEnabled()
  return isWhatsAppAiEnabled()
}

export async function generateAIWhatsAppResponse(
  templateText: string,
  vars: Record<string, string>,
  context?: { situation?: string }
): Promise<string> {
  const fallback = interpolateWhatsAppTemplate(templateText, vars)
  if (!isWhatsAppAiEnabled()) return fallback

  const resolved = resolveWhatsAppAiModel('rewrite')
  if (!resolved) return fallback

  try {
    const { text } = await generateText({
      model: resolved.model,
      system: REWRITE_SYSTEM,
      prompt:
        `צור הודעת WhatsApp טבעית ויפה למצב הזה.\n` +
        (context?.situation ? `מצב: ${context.situation}\n` : '') +
        `תבנית בסיסית:\n${fallback}\n\nהחזר רק את טקסט ההודעה, ללא הסברים.`,
      maxOutputTokens: 300,
    })
    if (text?.trim()) return text.trim()
  } catch (e) {
    console.warn('[whatsapp-ai] rewrite failed:', e instanceof Error ? e.message : String(e))
  }
  return fallback
}

export type AiIntakeBuildingCandidate = {
  id: string
  name: string
  address?: string | null
}

export type AiIntakeHistoryItem = {
  role: 'user' | 'assistant'
  text: string
}

export type AiIntakeDecision = {
  reply: string
  language: ResidentLang
  search_query: string | null
  select_project_id: string | null
  /** 1-based index into candidate list */
  select_project_index: number | null
  ticket_description: string | null
  open_ticket: boolean
}

export type AiIntakePromptInput = {
  latestUserText: string
  history: AiIntakeHistoryItem[]
  candidateBuildings: AiIntakeBuildingCandidate[]
  activeProject: { id: string; name: string; address?: string | null } | null
  lastReporterProject: { id: string; name: string } | null
}

export function emptyAiIntakeDecision(
  reply: string,
  language: ResidentLang = 'he'
): AiIntakeDecision {
  return {
    reply,
    language,
    search_query: null,
    select_project_id: null,
    select_project_index: null,
    ticket_description: null,
    open_ticket: false,
  }
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  return (fenced?.[1] ?? trimmed).trim()
}

export function parseAiIntakeDecision(
  raw: string,
  fallbackLang: ResidentLang = 'he'
): AiIntakeDecision | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>
    const languageRaw = String(parsed.language ?? fallbackLang).toLowerCase()
    const language: ResidentLang =
      languageRaw === 'fr' || languageRaw === 'en' || languageRaw === 'he'
        ? languageRaw
        : fallbackLang

    const reply = String(parsed.reply ?? '').trim()
    const search_query = parsed.search_query
      ? String(parsed.search_query).trim() || null
      : null
    const select_project_id = parsed.select_project_id
      ? String(parsed.select_project_id).trim() || null
      : null
    const idxRaw = parsed.select_project_index
    const select_project_index =
      typeof idxRaw === 'number' && Number.isFinite(idxRaw)
        ? Math.trunc(idxRaw)
        : typeof idxRaw === 'string' && /^\d+$/.test(idxRaw.trim())
          ? parseInt(idxRaw.trim(), 10)
          : null
    const ticket_description = parsed.ticket_description
      ? String(parsed.ticket_description).trim() || null
      : null
    const open_ticket = parsed.open_ticket === true

    if (!reply && !open_ticket) return null

    return {
      reply:
        reply ||
        (language === 'fr'
          ? 'Un instant, je traite votre demande.'
          : language === 'en'
            ? 'One moment while I process your request.'
            : 'רגע, מטפל בבקשה שלכם.'),
      language,
      search_query,
      select_project_id,
      select_project_index,
      ticket_description,
      open_ticket,
    }
  } catch {
    return null
  }
}

function buildIntakeUserPrompt(input: AiIntakePromptInput): string {
  const historyLines =
    input.history.length === 0
      ? '(אין היסטוריה)'
      : input.history
          .map((h) => `${h.role === 'user' ? 'דייר' : 'בוט'}: ${h.text}`)
          .join('\n')

  const candidates =
    input.candidateBuildings.length === 0
      ? '(אין מועמדים כרגע)'
      : input.candidateBuildings
          .map(
            (b, i) =>
              `${i + 1}. id=${b.id} | ${b.name}${b.address ? ` | ${b.address}` : ''}`
          )
          .join('\n')

  const active = input.activeProject
    ? `id=${input.activeProject.id} | ${input.activeProject.name}${
        input.activeProject.address ? ` | ${input.activeProject.address}` : ''
      }`
    : '(אין)'

  const last = input.lastReporterProject
    ? `id=${input.lastReporterProject.id} | ${input.lastReporterProject.name}`
    : '(אין)'

  return `הודעת דייר אחרונה:
${input.latestUserText}

היסטוריית שיחה (ישן→חדש):
${historyLines}

בניין פעיל בסשן:
${active}

בניין אחרון שעליו דיווח בעבר:
${last}

מועמדי בניין נוכחיים (אם יש רשימה פתוחה):
${candidates}

חשוב:
- אם הודעת הדייר מכילה רחוב/כתובת/שם בניין (גם בלי מספר) — חובה search_query (לא null).
- ברכה בלבד → search_query=null.
- אל תמציא בניינים בתשובה; החיפוש ירוץ בשרת על search_query.

החזר JSON עם השדות:
{
  "reply": string,
  "language": "he" | "fr" | "en",
  "search_query": string | null,
  "select_project_id": string | null,
  "select_project_index": number | null,
  "ticket_description": string | null,
  "open_ticket": boolean
}`
}


/** Host-side fallback: street-only text like "חלץ" must still hit Supabase search. */
export function looksLikeBuildingSearchText(text: string): boolean {
  const t = text.trim()
  if (!t || t.length < 2 || t.length > 80) return false
  if (/^(שלום|היי|הי|בוקר\s*טוב|ערב\s*טוב|תודה|ok|okay|hi|hello|bonjour)[!?.…]*$/i.test(t)) {
    return false
  }
  // Pure numeric selection 1..10 is list pick, not a new search.
  if (/^\d{1,2}$/.test(t)) return false
  // Project codes / START_ codes
  if (/^(START_)?BMK\d+/i.test(t)) return true
  // Hebrew / Latin street-like token (with or without house number)
  if (/[\u0590-\u05FFA-Za-z]{2,}/.test(t)) return true
  return false
}

/**
 * Prefer model search_query; if missing, use resident text when it looks like an address hint.
 */
export function resolveBuildingSearchQuery(
  decision: AiIntakeDecision,
  latestUserText: string
): string | null {
  const fromModel = decision.search_query?.trim() || null
  if (fromModel) return fromModel
  const raw = latestUserText.trim()
  if (!raw) return null
  if (decision.select_project_id || decision.select_project_index != null) return null
  if (decision.open_ticket && decision.ticket_description) return null
  if (!looksLikeBuildingSearchText(raw)) return null
  return raw
}

export async function decideUnknownResidentAiTurn(
  input: AiIntakePromptInput
): Promise<AiIntakeDecision | null> {
  if (!isWhatsAppAiIntakeEnabled()) return null

  const resolved = resolveWhatsAppAiModel('intake')
  if (!resolved) return null

  try {
    const { text } = await generateText({
      model: resolved.model,
      system: INTAKE_SYSTEM,
      prompt: buildIntakeUserPrompt(input),
      maxOutputTokens: 600,
      temperature: 0.2,
    })
    if (!text?.trim()) return null
    return parseAiIntakeDecision(text)
  } catch (e) {
    console.warn(
      '[whatsapp-ai] intake decision failed:',
      e instanceof Error ? e.message : String(e)
    )
    return null
  }
}

export function fallbackUnknownResidentPrompt(lang: ResidentLang = 'he'): AiIntakeDecision {
  if (lang === 'fr') {
    return emptyAiIntakeDecision(
      "Bonjour ! Pour ouvrir une demande, indiquez l'adresse de l'immeuble (rue et numéro).",
      'fr'
    )
  }
  if (lang === 'en') {
    return emptyAiIntakeDecision(
      'Hi! To open a request, please send the building address (street and number).',
      'en'
    )
  }
  return emptyAiIntakeDecision('שלום! לפתיחת תקלה כתבו את כתובת הבניין (רחוב ומספר).', 'he')
}
