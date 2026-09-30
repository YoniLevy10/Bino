import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResidentPortalMembershipView, TicketScope } from '@/lib/resident-portal/types'
import { createTicketShared } from '@/lib/tickets/create-ticket-service'
import { listPublishedAnnouncementsForMembership } from '@/lib/resident-portal/announcements'
import { listAmenitiesForMembership } from '@/lib/resident-portal/amenities'
import { listChargesForMembership } from '@/lib/resident-portal/charges'
import { buildMidragSearchUrl, midragCityMatchForCity } from '@/lib/midrag/external-search'

export type BotReply = {
  reply: string
  actions?: Array<{
    type: 'create_ticket' | 'midrag' | 'open_payments' | 'none'
    label: string
    href?: string
    payload?: Record<string, unknown>
  }>
  suggestedScope?: TicketScope
  ticket?: { id: string; ticketNumber: number } | null
}

function classifyScope(text: string): TicketScope {
  const t = text.trim()
  if (/דירה|בבית שלי|אצלי|בדירה|פרטי/.test(t)) return 'private'
  if (/לובי|מעלית|חניה|גינה|גג|משותף|בניין|מחסן משותף|חדר מדרגות/.test(t)) {
    return 'common'
  }
  return 'unclear'
}

function wantsTicketStatus(text: string): boolean {
  return /סטטוס|מה עם הקריאה|מצב התקלה|מספר קריאה|#\d+/.test(text)
}

function wantsPayments(text: string): boolean {
  return /תשלום|חיוב|ועד|יתרה|חשבונית|קבלה/.test(text)
}

function wantsAmenities(text: string): boolean {
  return /בריכה|כושר|מתקן|שעות|מתי פתוח/.test(text)
}

function wantsAnnouncements(text: string): boolean {
  return /הודעה|הודעות|מודעה|עדכון מההנהלה/.test(text)
}

/**
 * Deterministic portal bot — uses only authorized membership context.
 * Does not invent missing data; does not mark payments or book Midrag.
 */
export async function handleResidentBotTurn(
  admin: SupabaseClient,
  membership: ResidentPortalMembershipView,
  opts: {
    userId: string
    message: string
    confirmCreate?: boolean
    scopeOverride?: TicketScope | null
    idempotencyKey?: string | null
    tradeCategory?: string | null
  }
): Promise<BotReply> {
  const message = opts.message.trim()
  if (!message) {
    return { reply: 'כתבו בקצרה במה אפשר לעזור — תקלה, תשלום, הודעות או שעות מתקנים.' }
  }

  // Persist conversation (best-effort)
  let conversationId: string | null = null
  try {
    const { data: open } = await admin
      .from('resident_bot_conversations')
      .select('id')
      .eq('user_id', opts.userId)
      .eq('membership_id', membership.id)
      .eq('status', 'open')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    conversationId = open?.id ?? null
    if (!conversationId) {
      const { data: created } = await admin
        .from('resident_bot_conversations')
        .insert({
          user_id: opts.userId,
          membership_id: membership.id,
          client_id: membership.client_id,
          project_id: membership.project_id,
        })
        .select('id')
        .single()
      conversationId = created?.id ?? null
    }
    if (conversationId) {
      await admin.from('resident_bot_messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: message,
      })
      await admin
        .from('resident_bot_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
    }
  } catch (e) {
    console.error('[resident-bot] conversation persist', e)
  }

  if (wantsPayments(message)) {
    const { openBalance, charges } = await listChargesForMembership(admin, membership)
    const open = charges.filter((c) => c.status === 'sent' || c.status === 'failed').length
    const reply =
      open === 0
        ? 'אין חיובים פתוחים שפורסמו עבורכם כרגע. היסטוריה מלאה במסך התשלומים.'
        : `יתרה פתוחה משוערת: ₪${openBalance.toLocaleString('he-IL')} (${open} חיובים). לתשלום עברו למסך התשלומים — הסטטוס מתעדכן רק אחרי אישור שרת.`
    const out: BotReply = {
      reply,
      actions: [{ type: 'open_payments', label: 'מעבר לתשלומים', href: '/resident/payments' }],
    }
    await persistAssistant(admin, conversationId, out.reply)
    return out
  }

  if (wantsAnnouncements(message)) {
    const list = await listPublishedAnnouncementsForMembership(admin, membership)
    const reply =
      list.length === 0
        ? 'אין כרגע הודעות שפורסמו לדיירים בפרויקט זה.'
        : `הודעות אחרונות:\n${list
            .slice(0, 3)
            .map((a) => `• ${a.title}`)
            .join('\n')}`
    await persistAssistant(admin, conversationId, reply)
    return { reply }
  }

  if (wantsAmenities(message)) {
    const amenities = await listAmenitiesForMembership(admin, membership)
    if (amenities.length === 0) {
      const reply = 'לא פורסמו שעות מתקנים לפרויקט זה.'
      await persistAssistant(admin, conversationId, reply)
      return { reply }
    }
    const lines = amenities.map((a) => {
      if (a.today.source === 'none') return `• ${a.name}: לא פורסמו שעות להיום`
      if (a.today.is_closed) return `• ${a.name}: סגור היום`
      return `• ${a.name}: ${a.today.opens_at}–${a.today.closes_at}`
    })
    const reply = `שעות להיום (שעון ישראל):\n${lines.join('\n')}`
    await persistAssistant(admin, conversationId, reply)
    return { reply }
  }

  if (wantsTicketStatus(message)) {
    const { data: tickets } = await admin
      .from('tickets')
      .select('id, ticket_number, status, opened_at, closed_at')
      .eq('client_id', membership.client_id)
      .eq('reporter_membership_id', membership.id)
      .is('deleted_at', null)
      .order('opened_at', { ascending: false })
      .limit(5)
    if (!tickets?.length) {
      const reply = 'לא נמצאו קריאות שפתחתם בפורטל.'
      await persistAssistant(admin, conversationId, reply)
      return { reply }
    }
    const reply = tickets
      .map((t) => `#${t.ticket_number}: ${t.status}`)
      .join('\n')
    await persistAssistant(admin, conversationId, reply)
    return { reply: `הקריאות שלכם:\n${reply}` }
  }

  const scope = opts.scopeOverride || classifyScope(message)

  if (opts.confirmCreate) {
    try {
      const created = await createTicketShared(admin, {
        clientId: membership.client_id,
        projectId: membership.project_id,
        description: message,
        source: 'portal',
        reporterName: membership.resident_name,
        residentId: membership.resident_id,
        unitId: membership.unit_id,
        reporterMembershipId: membership.id,
        scope,
        portalIdempotencyKey: opts.idempotencyKey || null,
        autoAssign: scope !== 'private',
        skipPendingResident: true,
      })
      let reply = created.reused
        ? `הקריאה כבר נפתחה: מספר ${created.ticketNumber}.`
        : `נפתחה קריאה מספר ${created.ticketNumber}.`

      const actions: BotReply['actions'] = [
        { type: 'none', label: 'למעקב', href: `/resident/tickets` },
      ]

      if (scope === 'private') {
        const city = membership.project_city
        const cityMatch = midragCityMatchForCity(city)
        const category = opts.tradeCategory || 'other'
        if (cityMatch) {
          const href = buildMidragSearchUrl({ category, city })
          if (href) {
            actions.unshift({
              type: 'midrag',
              label: 'חיפוש בעל מקצוע במידרג',
              href,
            })
            reply +=
              ' זו תקלה פרטית — חברת הניהול לא משבצת אותה אוטומטית. אפשר לחפש בעל מקצוע במידרג.'
          }
        } else {
          reply +=
            ' זו תקלה פרטית. לא הוגדרה עיר לפרויקט או שהעיר לא ממופה למידרג — בחרו עיר במסך התקלות.'
        }
      }

      const out: BotReply = {
        reply,
        suggestedScope: scope,
        ticket: { id: created.ticketId, ticketNumber: created.ticketNumber },
        actions,
      }
      await persistAssistant(admin, conversationId, out.reply)
      return out
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'פתיחת קריאה נכשלה'
      console.error('[resident-bot] create ticket', e)
      const out: BotReply = {
        reply: `${msg}. אפשר לפתוח תקלה ידנית בטופס.`,
        actions: [{ type: 'create_ticket', label: 'טופס תקלה', href: '/resident/tickets' }],
      }
      await persistAssistant(admin, conversationId, out.reply)
      return out
    }
  }

  const scopeLabel =
    scope === 'common' ? 'שטח משותף' : scope === 'private' ? 'דירה פרטית' : 'לא ברור'
  const reply = `נשמע כמו תקלה (${scopeLabel}). אפשר לתקן את הסיווג ולאשר פתיחת קריאה. אם השירות נכשל — השתמשו בטופס התקלות.`
  const out: BotReply = {
    reply,
    suggestedScope: scope,
    actions: [
      {
        type: 'create_ticket',
        label: 'אישור ופתיחת קריאה',
        payload: { confirmCreate: true, scope, message },
      },
    ],
  }
  await persistAssistant(admin, conversationId, out.reply)
  return out
}

async function persistAssistant(
  admin: SupabaseClient,
  conversationId: string | null,
  content: string
) {
  if (!conversationId) return
  try {
    await admin.from('resident_bot_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content,
    })
  } catch (e) {
    console.error('[resident-bot] assistant persist', e)
  }
}
