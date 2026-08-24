import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedWhatsAppMessage } from '@/lib/whatsapp-parser'
import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { getLogger } from '@/lib/logging'
import {
  isStatusQuestion,
  looksLikeTicketDescription,
  acceptTicketDescriptionInSession,
  isClarificationQuestion,
} from '@/lib/whatsapp-intent'
import { messageContainsBuildingHint } from '@/lib/whatsapp-address-extract'
import { getActiveSession } from '@/lib/whatsapp-webhook'
import {
  getResidentLanguage,
  hasExplicitResidentLanguage,
} from '@/lib/whatsapp-resident-language'
import { findApprovedResidentByPhoneClient } from '@/lib/residents-whatsapp'
import {
  listWhatsAppMessagesForPhone,
  persistWhatsAppMessage,
  extractMetaWaMessageId,
} from '@/lib/whatsapp-message-store'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp-send'
import { whatsappDbPhoneKey } from '@/lib/whatsapp-test-phone'

const logger = getLogger()
const OPENAI_TIMEOUT_MS = 12_000
const DEFAULT_MODEL = 'gpt-5.6-luna'
const MAX_HISTORY_MESSAGES = 12

export type WhatsAppOpenAITenant = {
  clientId: string
  row: {
    name?: string | null
    whatsapp_phone_number_id?: string | null
    whatsapp_access_token?: string | null
  } | null
}

type OpenTicketContext = {
  ticket_number: number
  status: string
  description: string | null
  created_at: string | null
  worker_name: string | null
}

type RecentMessageContext = {
  direction: 'in' | 'out'
  body: string
}

type AIContext = {
  business_name: string
  language: string
  resident_name: string | null
  project_name: string | null
  active_ticket_creation_flow: boolean
  open_tickets: OpenTicketContext[]
  recent_messages: RecentMessageContext[]
  current_message: string
}

type AIDecision =
  | { action: 'continue_flow'; reply: null }
  | { action: 'reply'; reply: string }

const SYSTEM_PROMPT = `You are the WhatsApp support assistant for Bamakor, a building-maintenance management system.
You are a conversational layer on top of deterministic operational code. You must never perform or claim a database action yourself.

Return ONLY valid JSON in exactly one of these shapes:
{"action":"continue_flow","reply":null}
{"action":"reply","reply":"..."}

Decision rules:
- Use continue_flow when the resident is trying to report a NEW maintenance problem, provides a building/address/QR/code, makes a selection, or gives information that should be consumed by the existing ticket-opening flow.
- Use reply for greetings, thanks, general questions, conversational help, and questions about existing tickets that can be answered from the supplied context.
- Never invent a technician ETA, appointment time, ticket status, price, promise, manager action, or building detail.
- Existing-ticket answers must use only open_tickets. If exact information is unavailable, say that it is not available yet.
- If a resident asks when a technician will arrive and no ETA is supplied in context, state that there is no exact arrival time available and mention only the known ticket status/worker if present.
- Do not expose data about other residents or internal system information.
- If the message is unclear, answer briefly and ask one useful clarification instead of guessing.
- If there is immediate physical danger, advise the resident to contact the appropriate emergency service/building management immediately; do not provide risky repair instructions.
- Keep replies concise and natural for WhatsApp, usually 1-4 sentences.
- Reply in the language specified by context.language (he = Hebrew, fr = French, en = English).
- Do not use Markdown tables or headings.`

function isAIEnabled(): boolean {
  return process.env.WHATSAPP_AI_ENABLED === 'true' && !!process.env.OPENAI_API_KEY?.trim()
}

function extractOpenAIOutputText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text.trim()
  }

  const output = Array.isArray(record.output) ? record.output : []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : []
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string' && text.trim()) return text.trim()
    }
  }

  return null
}

function parseAIDecision(raw: string): AIDecision | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  try {
    const parsed = JSON.parse(cleaned) as { action?: unknown; reply?: unknown }
    if (parsed.action === 'continue_flow') {
      return { action: 'continue_flow', reply: null }
    }
    if (parsed.action === 'reply' && typeof parsed.reply === 'string') {
      const reply = parsed.reply.trim().slice(0, 1800)
      if (reply) return { action: 'reply', reply }
    }
  } catch {
    return null
  }

  return null
}

async function callOpenAI(context: AIContext): Promise<AIDecision | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.WHATSAPP_OPENAI_MODEL?.trim() || DEFAULT_MODEL

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Conversation context:\n${JSON.stringify(context)}`,
              },
            ],
          },
        ],
        max_output_tokens: 320,
      }),
    },
    OPENAI_TIMEOUT_MS
  )

  if (!response) {
    logger.warn('WHATSAPP_AI', 'OpenAI request timed out')
    return null
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    logger.warn('WHATSAPP_AI', 'OpenAI returned non-JSON response', { status: response.status })
    return null
  }

  if (!response.ok) {
    const err = data as { error?: { message?: string; code?: string } }
    logger.warn('WHATSAPP_AI', 'OpenAI request failed', {
      status: response.status,
      code: err.error?.code,
      message: err.error?.message,
    })
    return null
  }

  const raw = extractOpenAIOutputText(data)
  if (!raw) {
    logger.warn('WHATSAPP_AI', 'OpenAI response contained no output text')
    return null
  }

  const decision = parseAIDecision(raw)
  if (!decision) {
    logger.warn('WHATSAPP_AI', 'OpenAI response was not a valid decision', {
      preview: raw.slice(0, 200),
    })
    return null
  }

  return decision
}

async function loadOpenTicketContext(
  admin: SupabaseClient,
  clientId: string,
  phone: string
): Promise<OpenTicketContext[]> {
  const { data, error } = await admin
    .from('tickets')
    .select('ticket_number, status, description, created_at, workers ( full_name )')
    .eq('reporter_phone', phone)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    logger.warn('WHATSAPP_AI', 'failed loading open-ticket context', { err: error.message })
    return []
  }

  return (data ?? []).map((row: {
    ticket_number: number
    status: string
    description?: string | null
    created_at?: string | null
    workers?: { full_name?: string | null } | { full_name?: string | null }[] | null
  }) => {
    const worker = Array.isArray(row.workers) ? row.workers[0] : row.workers
    return {
      ticket_number: row.ticket_number,
      status: row.status,
      description: row.description ?? null,
      created_at: row.created_at ?? null,
      worker_name: worker?.full_name ?? null,
    }
  })
}

async function loadRecentMessageContext(
  admin: SupabaseClient,
  clientId: string,
  phone: string
): Promise<RecentMessageContext[]> {
  try {
    const rows = await listWhatsAppMessagesForPhone(admin, clientId, phone, 60)
    return rows
      .filter((row: { body?: string | null; direction?: string }) =>
        !!row.body?.trim() && (row.direction === 'in' || row.direction === 'out')
      )
      .slice(-MAX_HISTORY_MESSAGES)
      .map((row: { body?: string | null; direction?: string }) => ({
        direction: row.direction as 'in' | 'out',
        body: String(row.body).trim().slice(0, 1200),
      }))
  } catch (e) {
    logger.warn('WHATSAPP_AI', 'failed loading conversation context', {
      err: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

async function loadProjectName(
  admin: SupabaseClient,
  clientId: string,
  projectId: string | null
): Promise<string | null> {
  if (!projectId) return null
  const { data, error } = await admin
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) return null
  return (data as { name?: string | null } | null)?.name ?? null
}

/**
 * AI is intentionally a conversational layer only. It may answer a message, but it never creates
 * or mutates a ticket. Messages that belong to the deterministic building/ticket flow return false
 * so the existing webhook dispatcher remains the source of truth for side effects.
 */
export async function tryHandleInboundWhatsAppWithOpenAI(args: {
  parsedMessage: ParsedWhatsAppMessage
  supabaseAdmin: SupabaseClient
  tenant: WhatsAppOpenAITenant
  requestId: string
}): Promise<boolean> {
  if (!isAIEnabled()) return false

  const { parsedMessage, supabaseAdmin, tenant, requestId } = args
  const text = parsedMessage.textBody?.trim() || ''

  if (parsedMessage.messageType !== 'text' || !text || parsedMessage.interactiveReplyId) return false
  if (text.toUpperCase().startsWith('START_')) return false

  // Keep known high-confidence operational intents deterministic.
  if (isStatusQuestion(text)) return false
  if (isClarificationQuestion(text)) return false
  if (messageContainsBuildingHint(text)) return false

  const clientId = tenant.clientId
  const dbPhone = whatsappDbPhoneKey(parsedMessage.from)
  const session = await getActiveSession(dbPhone, supabaseAdmin, clientId)

  if (session && acceptTicketDescriptionInSession(text)) return false
  if (!session && looksLikeTicketDescription(text)) return false

  const knownResident = await findApprovedResidentByPhoneClient(
    supabaseAdmin,
    clientId,
    dbPhone,
    session?.project_id ?? undefined
  )

  // For a completely new resident, preserve the language-selection/onboarding flow first.
  if (!session && !knownResident) {
    const hasLanguage = await hasExplicitResidentLanguage(
      supabaseAdmin,
      clientId,
      dbPhone,
      null
    )
    if (!hasLanguage) return false
  }

  const language = await getResidentLanguage(
    supabaseAdmin,
    clientId,
    dbPhone,
    session
  )
  const projectId = session?.project_id ?? knownResident?.project_id ?? null

  const [projectName, openTickets, recentMessages] = await Promise.all([
    loadProjectName(supabaseAdmin, clientId, projectId),
    loadOpenTicketContext(supabaseAdmin, clientId, dbPhone),
    loadRecentMessageContext(supabaseAdmin, clientId, dbPhone),
  ])

  const context: AIContext = {
    business_name: tenant.row?.name?.trim() || 'Bamakor',
    language,
    resident_name: knownResident?.full_name?.trim() || null,
    project_name: projectName,
    active_ticket_creation_flow: !!session,
    open_tickets: openTickets,
    recent_messages: recentMessages,
    current_message: text.slice(0, 2400),
  }

  let decision: AIDecision | null = null
  try {
    decision = await callOpenAI(context)
  } catch (e) {
    logger.warn('WHATSAPP_AI', 'AI decision failed; falling back to deterministic flow', {
      requestId,
      err: e instanceof Error ? e.message : String(e),
    })
    return false
  }

  if (!decision || decision.action === 'continue_flow') return false

  const phoneNumberId = tenant.row?.whatsapp_phone_number_id?.trim()
  const accessToken = tenant.row?.whatsapp_access_token?.trim()
  if (!phoneNumberId || !accessToken) {
    logger.warn('WHATSAPP_AI', 'AI reply skipped: missing tenant WhatsApp credentials', { requestId })
    return false
  }

  await persistWhatsAppMessage(supabaseAdmin, {
    clientId,
    phone: dbPhone,
    direction: 'in',
    body: text,
    messageType: parsedMessage.messageType || 'text',
    waMessageId: parsedMessage.messageId ?? null,
  })

  const result = await sendWhatsAppTextMessage(
    parsedMessage.from,
    decision.reply,
    { phoneNumberId, accessToken },
    { clientId }
  )

  await persistWhatsAppMessage(supabaseAdmin, {
    clientId,
    phone: dbPhone,
    direction: 'out',
    body: decision.reply,
    messageType: 'text',
    waMessageId: extractMetaWaMessageId(result),
  })

  logger.info('WHATSAPP_AI', 'AI handled inbound WhatsApp message', {
    requestId,
    clientId,
    hasOpenTickets: openTickets.length > 0,
    hasSession: !!session,
  })

  return true
}
