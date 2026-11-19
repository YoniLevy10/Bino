import { SupabaseClient } from '@supabase/supabase-js'
import { isTicketInTreatment } from '@/lib/tickets/ticket-status'
import { resolveClientIdByWhatsAppPhoneNumberId } from '@/lib/tenant/tenant-resolution'
import {
  parseIncomingWhatsAppMessage,
  extractWhatsAppPhoneNumberId,
  type ParsedWhatsAppMessage,
} from '@/lib/whatsapp/whatsapp-parser'
import { webhookDedupeMessageId } from '@/lib/whatsapp/whatsapp-webhook-dedupe'
import {
  isStatusQuestion,
  looksLikeTicketDescription,
  acceptTicketDescriptionInSession,
  resolveTicketPriorityFromResidentMessage,
  statusLabelHe,
  isClarificationQuestion,
  inferResidentLanguageFromText,
} from '@/lib/whatsapp/whatsapp-intent'
import { resolveMessageForLanguage, normalizeResidentLang, splitTrilingualTemplate, type ResidentLang } from '@/lib/whatsapp/whatsapp-bilingual-template'
import {
  getResidentLanguage,
  saveResidentLanguage,
  hasExplicitResidentLanguage,
  preferredLanguageForNewSession,
} from '@/lib/whatsapp/whatsapp-resident-language'
import { messageContainsBuildingHint } from '@/lib/whatsapp/whatsapp-address-extract'
import { RESIDENT_UI_COPY, residentGreetingPrefix } from '@/lib/whatsapp/whatsapp-resident-copy'
import { fetchWithTimeout as fetchTimeout } from '@/lib/shared/fetch-timeout'
import {
  parseStartCode,
  isNumericSelection,
  searchProjectsByBuilding,
  searchProjectsInList,
  fetchAllProjectsForClient,
  WA_PROJECT_LIST_MAX_ROWS,
  createPendingSelection,
  getPendingSelection,
  clearPendingSelection,
  expireInactiveSessions,
  getActiveSession,
  type SessionRow,
} from '@/lib/whatsapp-webhook'
import { findOpenTicketForPhone, findDuplicateOpenWhatsAppTicket, parseRecentDuplicateWhatsAppTicketError, readLastReporterProject } from '@/lib/whatsapp-webhook/flow-ticket'
import {
  isStashedBuildingSearchRow,
  readStashedBuildingSearchText,
  readStashedProblemDescription,
  stashBuildingSearchText,
  stashProblemDescription,
  stashPreSessionMedia,
  promoteStashedMediaToSession,
} from '@/lib/whatsapp-webhook/building-search-stash'
import type { ProjectRow } from '@/lib/whatsapp/whatsapp-interactive'
import {
  buildProjectSelectionListPayload,
  buildLanguageButtonsPayload,
  buildLastProjectConfirmButtonsPayload,
  parseProjectListReplyId,
  parseLanguageButtonReplyId,
  parseLastProjectButtonReplyId,
} from '@/lib/whatsapp/whatsapp-interactive'
import {
  persistWhatsAppMessage,
  extractMetaWaMessageId,
} from '@/lib/whatsapp/whatsapp-message-store'
import {
  sendWhatsAppTextMessage,
  sendWhatsAppInteractivePayloadWithCredentials,
} from '@/lib/whatsapp/whatsapp-send'
import type { WhatsAppTemplateKey } from '@/lib/whatsapp/whatsapp-template-keys'
import { WHATSAPP_TEMPLATE_EDITOR_DEFAULTS, SMS_TEMPLATE_EDITOR_DEFAULTS } from '@/lib/whatsapp/whatsapp-template-keys'
import { resolveWhatsAppTemplateMessage, resolveSmsTemplateMessage } from '@/lib/whatsapp/whatsapp-templates'
import { sendManagerSMS, getManagerPhoneFromEnv } from '@/lib/sms/sms-send'
import { autoAssignTicketFromProject } from '@/lib/assign-ticket-worker'
import { notifyAlertWorkersOnNewTicket } from '@/lib/notify/notify-field-workers-new-ticket'
import { notifyNewTicketPush } from '@/lib/push/push-notifications'
import {
  downloadWhatsAppMedia,
  uploadWhatsAppMediaToStorage,
  createAttachmentRecord,
} from '@/lib/whatsapp/whatsapp-media'
import { getLogger } from '@/lib/shared/logging'
import { logCriticalOperationalFailure } from '@/lib/errors/error-logs-db'
import { getPublicTicketsUrl } from '@/lib/shared/public-app-url'
import { isWhatsAppTestSender, whatsappDbPhoneKey } from '@/lib/whatsapp/whatsapp-test-phone'
import { queuePendingResidentApproval, reporterListedInProjectResidents } from '@/lib/residents/pending-resident-from-ticket'
import { recoverAllWhatsAppMediaForTicket } from '@/lib/whatsapp/whatsapp-recover-stashed-media'
import { checkAndFlagRecurringIssue } from '@/lib/ops/predictive-alerts'
import {
  findApprovedResidentByPhoneClient,
  reporterDisplayNameForNotification,
} from '@/lib/residents/residents-whatsapp'
import { isWhatsAppAiIntakeEnabled } from '@/lib/whatsapp/whatsapp-ai'
import { isClientWhatsAppAiChatEnabled } from '@/lib/whatsapp-ai-chat/gate'
import { runClientWhatsAppAiChat } from '@/lib/whatsapp-ai-chat/run'
import { runUnknownResidentAiIntake } from '@/lib/whatsapp-webhook/ai-unknown-resident-intake'
import { translateToHebrew } from '@/lib/google/google-translate'
import { managerOutreachAckInboundBody } from '@/lib/whatsapp/whatsapp-manager-outreach'

const logger = getLogger()

import {
  afterResidentSessionCreated,
  resetSessionCompletely,
  getTicketStatus,
} from '@/lib/whatsapp-webhook/inbound-session'
import {
  handleWhatsAppInboundMedia,
  attachPendingWhatsAppMediaToTicketIfAny,
  logWebhookOperationalError,
  type WaInboundMediaKind,
} from '@/lib/whatsapp-webhook/inbound-media'

/** אופציונלי: טננט שנפתר ב-route לפני background — למניעת כפילות DB */
export type WaWebhookTenant = { clientId: string; row: Record<string, unknown> }

export async function runWhatsAppInboundBackground(
  body: unknown,
  requestId: string,
  parsedMessage: ParsedWhatsAppMessage,
  supabaseAdmin: SupabaseClient,
  tenantPreResolved?: WaWebhookTenant
): Promise<void> {
  try {
    let webhookClientId: string
    let waClient: {
      id: string
      name?: string | null
      sms_sender_name?: string | null
      whatsapp_phone_number_id?: string | null
      whatsapp_access_token?: string | null
      manager_phone?: string | null
      default_worker_phone?: string | null
      sms_on_ticket_open?: boolean | null
      sms_on_ticket_close?: boolean | null
    } | null

    if (tenantPreResolved) {
      webhookClientId = tenantPreResolved.clientId
      waClient = tenantPreResolved.row as typeof waClient
    } else {
      const phoneNumberId = extractWhatsAppPhoneNumberId(body)
      if (!phoneNumberId) {
        logger.error('WEBHOOK', 'missing phone_number_id in webhook metadata', new Error('missing_phone_number_id'))
        return
      }

      const waResolved = await resolveClientIdByWhatsAppPhoneNumberId(supabaseAdmin, phoneNumberId)
      if (!waResolved) {
        logger.error(
          'WEBHOOK',
          'No client for WhatsApp phone_number_id',
          new Error('no_client_for_phone_number_id'),
          { requestId, phoneNumberId }
        )
        void logWebhookOperationalError(
          'tenant_resolve',
          `No client for WhatsApp phone_number_id ${phoneNumberId}`,
          undefined,
          { requestId, phoneNumberId }
        )
        return
      }
      webhookClientId = waResolved.clientId
      waClient = waResolved.row as typeof waClient
    }

    const residentWhatsAppCreds = {
      phoneNumberId: (waClient as { whatsapp_phone_number_id?: string | null } | null)
        ?.whatsapp_phone_number_id || undefined,
      accessToken: (waClient as { whatsapp_access_token?: string | null } | null)
        ?.whatsapp_access_token || undefined,
    }

    const clientName = (waClient as { name?: string | null } | null)?.name || 'המערכת'
    const smsSenderName = (waClient as { sms_sender_name?: string | null } | null)?.sms_sender_name || null
    const clientManagerPhone = (waClient as { manager_phone?: string | null } | null)?.manager_phone || null
    const smsOnTicketOpen = (waClient as { sms_on_ticket_open?: boolean | null } | null)?.sms_on_ticket_open !== false

    type WaTemplateVars = Partial<
      Record<'project_name' | 'ticket_number' | 'description' | 'reporter_name' | 'building_line' | 'list', string>
    >

    async function sendWa(
      to: string,
      templateKey: WhatsAppTemplateKey,
      creds?: { phoneNumberId?: string; accessToken?: string },
      vars: WaTemplateVars = {},
      lang: ResidentLang = residentLang
    ) {
      const raw = await resolveWhatsAppTemplateMessage(
        supabaseAdmin,
        webhookClientId,
        templateKey,
        WHATSAPP_TEMPLATE_EDITOR_DEFAULTS[templateKey],
        vars
      )
      const msg = resolveMessageForLanguage(raw, lang)
      logger.info('WEBHOOK', 'WA template send', {
        requestId,
        templateKey,
        lang,
        to: isWhatsAppTestSender(to) ? '(test)' : `…${to.slice(-4)}`,
      })
      const result = await sendWhatsAppTextMessage(to, msg, creds, { clientId: webhookClientId })
      void persistWhatsAppMessage(supabaseAdmin, {
        clientId: webhookClientId,
        phone: from,
        direction: 'out',
        body: msg,
        messageType: 'text',
        waMessageId: extractMetaWaMessageId(result),
      })
      return result
    }

    async function resolveWaBodyForLang(
      templateKey: WhatsAppTemplateKey,
      lang: ResidentLang,
      vars: WaTemplateVars = {}
    ): Promise<string> {
      const raw = await resolveWhatsAppTemplateMessage(
        supabaseAdmin,
        webhookClientId,
        templateKey,
        WHATSAPP_TEMPLATE_EDITOR_DEFAULTS[templateKey],
        vars
      )
      return resolveMessageForLanguage(raw, lang)
    }

    async function sendWaInteractiveList(
      to: string,
      projects: ProjectRow[],
      bodyText: string,
      creds?: { phoneNumberId?: string; accessToken?: string },
      lang: ResidentLang = residentLang
    ) {
      if (!creds?.phoneNumberId || !creds?.accessToken) return null
      const payload = buildProjectSelectionListPayload(to, projects, bodyText, lang)
      const result = await sendWhatsAppInteractivePayloadWithCredentials(
        creds.phoneNumberId,
        creds.accessToken,
        payload
      )
      void persistWhatsAppMessage(supabaseAdmin, {
        clientId: webhookClientId,
        phone: from,
        direction: 'out',
        body: bodyText,
        messageType: 'interactive',
        interactivePayload: payload.interactive as Record<string, unknown>,
        waMessageId: extractMetaWaMessageId(result),
      })
      return result
    }

    async function sendWaLanguageButtons(
      to: string,
      creds?: { phoneNumberId?: string; accessToken?: string }
    ) {
      if (!creds?.phoneNumberId || !creds?.accessToken) return null
      const raw = await resolveWhatsAppTemplateMessage(
        supabaseAdmin,
        webhookClientId,
        'choose_language',
        WHATSAPP_TEMPLATE_EDITOR_DEFAULTS.choose_language,
        {}
      )
      const { he, fr, en } = splitTrilingualTemplate(raw)
      const bodyText = [he, fr, en].filter(Boolean).join('\n')
      const payload = buildLanguageButtonsPayload(to, bodyText)
      const result = await sendWhatsAppInteractivePayloadWithCredentials(
        creds.phoneNumberId,
        creds.accessToken,
        payload
      )
      void persistWhatsAppMessage(supabaseAdmin, {
        clientId: webhookClientId,
        phone: from,
        direction: 'out',
        body: bodyText,
        messageType: 'interactive',
        interactivePayload: payload.interactive as Record<string, unknown>,
        waMessageId: extractMetaWaMessageId(result),
      })
      return result
    }

    let openTicketAfterBuildingSearch: string | null = null

    async function finalizeProjectSelection(
      matchedProject: ProjectRow,
      lang: ResidentLang,
      /** Original resident text — used to auto-open when one message has both address + fault. */
      sourceText?: string | null
    ): Promise<void> {
      residentLang = lang
      await supabaseAdmin
        .from('sessions')
        .update({ is_active: false, active_ticket_id: null, last_activity_at: new Date().toISOString() })
        .eq('phone_number', from)
        .eq('client_id', webhookClientId)
        .eq('is_active', true)

      const sessionLang = await preferredLanguageForNewSession(
        supabaseAdmin,
        webhookClientId,
        from,
        lang
      )

      const stashedDesc = await readStashedProblemDescription(from, supabaseAdmin, webhookClientId)
      const combinedSource = sourceText?.trim() || null
      const autoDescription =
        stashedDesc ||
        (combinedSource &&
        looksLikeTicketDescription(combinedSource) &&
        messageContainsBuildingHint(combinedSource)
          ? combinedSource
          : null)

      const { data: createdSession, error: sessionCreateError } = await supabaseAdmin
        .from('sessions')
        .insert({
          phone_number: from,
          client_id: webhookClientId,
          project_id: matchedProject.id,
          is_active: true,
          active_ticket_id: null,
          preferred_language: sessionLang,
          last_activity_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (sessionCreateError) {
        logger.error('WEBHOOK', 'session create from project selection failed', new Error(sessionCreateError.message))
        try {
          await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      if (createdSession?.id) {
        await afterResidentSessionCreated(from, createdSession.id, supabaseAdmin, webhookClientId)
      }

      await clearPendingSelection(from, supabaseAdmin, webhookClientId)

      if (autoDescription) {
        openTicketAfterBuildingSearch = autoDescription
        residentLang = sessionLang
        return
      }

      try {
        await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
          project_name: matchedProject.name,
        }, sessionLang)
      } catch { /* WA send failure is non-fatal */ }
    }

    async function sendWaLastProjectConfirm(
      to: string,
      projectName: string,
      lang: ResidentLang,
      creds?: { phoneNumberId?: string; accessToken?: string }
    ) {
      if (!creds?.phoneNumberId || !creds?.accessToken) return null
      const bodyText = await resolveWaBodyForLang('last_project_confirm', lang, {
        project_name: projectName,
      })
      const payload = buildLastProjectConfirmButtonsPayload(to, bodyText, lang)
      const result = await sendWhatsAppInteractivePayloadWithCredentials(
        creds.phoneNumberId,
        creds.accessToken,
        payload
      )
      void persistWhatsAppMessage(supabaseAdmin, {
        clientId: webhookClientId,
        phone: from,
        direction: 'out',
        body: bodyText,
        messageType: 'interactive',
        interactivePayload: payload.interactive as Record<string, unknown>,
        waMessageId: extractMetaWaMessageId(result),
      })
      return result
    }

    async function continueAfterLanguageResolved(lang: ResidentLang): Promise<void> {
      residentLang = lang
      const allProjects = await fetchAllProjectsForClient(supabaseAdmin, webhookClientId)

      if (allProjects.length === 1) {
        await finalizeProjectSelection(allProjects[0], lang)
        return
      }

      const lastProject = await readLastReporterProject(supabaseAdmin, webhookClientId, from)
      if (lastProject) {
        const fullProject = allProjects.find((p) => p.id === lastProject.projectId)
        if (fullProject) {
          const pendingCreated = await createPendingSelection(
            from,
            [fullProject],
            supabaseAdmin,
            webhookClientId,
            lang
          )
          if (!pendingCreated) {
            try {
              await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
            } catch { /* WA send failure is non-fatal */ }
            return
          }
          try {
            await sendWaLastProjectConfirm(
              waRecipient,
              lastProject.projectName,
              lang,
              residentWhatsAppCreds
            )
          } catch { /* WA send failure is non-fatal */ }
          return
        }
      }

      try {
        await sendWa(waRecipient, 'ask_building', residentWhatsAppCreds, {}, lang)
      } catch { /* WA send failure is non-fatal */ }
    }

    async function completeBuildingSearchForResident(searchText: string, lang: ResidentLang): Promise<void> {
      residentLang = lang
      let searchResults = await searchProjectsByBuilding(searchText, supabaseAdmin, webhookClientId)

      if (searchResults.length === 0) {
        try {
          const hebrew = await translateToHebrew(searchText, 5000)
          if (hebrew && hebrew !== searchText) {
            const translatedResults = await searchProjectsByBuilding(hebrew, supabaseAdmin, webhookClientId)
            if (translatedResults.length > 0) searchResults = translatedResults
          }
        } catch { /* translation failure is non-fatal */ }
      }

      if (searchResults.length === 0) {
        try {
          await sendWa(waRecipient, 'building_not_found', residentWhatsAppCreds, {}, lang)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      if (searchResults.length === 1) {
        await finalizeProjectSelection(searchResults[0], lang, searchText)
        return
      }

      const matches = searchResults.slice(0, WA_PROJECT_LIST_MAX_ROWS)
      const pendingCreated = await createPendingSelection(
        from,
        matches,
        supabaseAdmin,
        webhookClientId,
        lang
      )
      if (!pendingCreated) {
        try {
          await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      try {
        await sendWaInteractiveList(
          waRecipient,
          matches,
          await resolveWaBodyForLang('building_list_body', lang),
          residentWhatsAppCreds,
          lang
        )
      } catch { /* WA send failure is non-fatal */ }
    }

    // Expire temporary WhatsApp session state if inactive (scoped to this tenant)
    // Fire-and-forget: don't block the critical message-handling path if Supabase is slow/ETIMEDOUT
    void expireInactiveSessions(supabaseAdmin, webhookClientId)

    const { from: waFrom, messageType, textBody, mediaId, mediaType, location: waLocation, interactiveReplyId } = parsedMessage
    const waRecipient = waFrom
    const from = whatsappDbPhoneKey(waFrom)
    const isTestWhatsAppSender = isWhatsAppTestSender(waFrom)
    const managerAckBody = managerOutreachAckInboundBody(
      interactiveReplyId,
      parsedMessage.interactiveReplyTitle
    )
    const isManagerAck = Boolean(managerAckBody)

    let session = await getActiveSession(from, supabaseAdmin, webhookClientId)
    let residentLang: ResidentLang = await getResidentLanguage(
      supabaseAdmin,
      webhookClientId,
      from,
      session
    )

    void persistWhatsAppMessage(supabaseAdmin, {
      clientId: webhookClientId,
      phone: from,
      direction: 'in',
      body:
        managerAckBody ||
        textBody ||
        (messageType === 'image' && mediaId ? '📷 תמונה' : null) ||
        (messageType === 'video' && mediaId ? '🎬 וידאו' : null) ||
        (interactiveReplyId ? `[${interactiveReplyId}]` : null),
      messageType: messageType || 'text',
      waMessageId: parsedMessage.messageId ?? null,
      whatsappMediaId:
        mediaId && (mediaType === 'image' || mediaType === 'video') ? mediaId : null,
      whatsappMediaKind:
        mediaType === 'image' || mediaType === 'video' ? mediaType : null,
      interactivePayload: interactiveReplyId
        ? {
            reply_id: interactiveReplyId,
            title: parsedMessage.interactiveReplyTitle,
            ...(isManagerAck ? { manager_outreach_ack: true } : {}),
          }
        : null,
    })

    // Template QUICK_REPLY «קיבלתי» — engage 24h session only; do not open tickets / AI intake.
    if (isManagerAck) {
      logger.info('WEBHOOK', 'Manager outreach ack — session engaged', {
        requestId,
        from: isTestWhatsAppSender ? '(test)' : waRecipient,
        replyId: interactiveReplyId ?? null,
      })
      return
    }

    logger.info('WEBHOOK', 'Parsed incoming message', {
      requestId,
      from: isTestWhatsAppSender ? '(test)' : waRecipient,
      messageType,
      hasText: !!textBody,
      hasMedia: !!mediaId,
    })

    // Meta sends type=unsupported placeholders (often 131060) before the real image/video webhook — ignore silently.
    if (messageType === 'unsupported') {
      logger.info('WEBHOOK', 'Meta unsupported webhook ignored', {
        requestId,
        unsupportedErrorCode: parsedMessage.unsupportedErrorCode ?? null,
      })
      return
    }

    if (messageType === 'location') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      return
    }

    if (messageType === 'sticker') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      return
    }

    if (messageType === 'contacts') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      return
    }

    if (messageType === 'audio') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      return
    }

    if (messageType === 'document') {
      try {
        await sendWa(waRecipient, 'unsupported_message', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      return
    }

    if (
      (messageType === 'image' && mediaId && mediaType === 'image') ||
      (messageType === 'video' && mediaId && mediaType === 'video')
    ) {
      await handleWhatsAppInboundMedia(
        from,
        webhookClientId,
        supabaseAdmin,
        mediaId,
        mediaType as WaInboundMediaKind,
        waRecipient,
        sendWa,
        residentWhatsAppCreds,
        isTestWhatsAppSender,
        textBody || undefined,
        async () => {
          const hasLang = await hasExplicitResidentLanguage(
            supabaseAdmin,
            webhookClientId,
            from,
            null
          )
          if (!hasLang) {
            await sendWaLanguageButtons(waRecipient, residentWhatsAppCreds)
            return
          }
          const lang = await getResidentLanguage(supabaseAdmin, webhookClientId, from, null)
          await continueAfterLanguageResolved(lang)
        }
      )
      if (!textBody) return
    }

    if (!textBody) {
      if (messageType === 'reaction') {
        try {
          await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
        } catch (sendError) {
          // WA send failure is non-fatal
        }
        return
      }
      const knownEmptyBodyTypes = new Set([
        'text',
        'image',
        'location',
        'contacts',
        'sticker',
        'audio',
        'video',
        'document',
        'reaction',
        'interactive',
        'button',
      ])
      if (!knownEmptyBodyTypes.has(messageType)) {
        try {
          await sendWa(
            waRecipient,
            'unsupported_message',
            residentWhatsAppCreds
          )
        } catch { /* WA send failure is non-fatal */ }
      }
      return
    }

    if (interactiveReplyId) {
      const lastProjectPick = parseLastProjectButtonReplyId(interactiveReplyId)
      if (lastProjectPick) {
        const pendingLast = await getPendingSelection(from, supabaseAdmin, webhookClientId)
        const sessionLang = pendingLast?.preferred_language?.trim()
          ? normalizeResidentLang(pendingLast.preferred_language)
          : residentLang

        if (lastProjectPick === 'other') {
          await clearPendingSelection(from, supabaseAdmin, webhookClientId)
          try {
            await sendWa(waRecipient, 'ask_building', residentWhatsAppCreds, {}, sessionLang)
          } catch { /* WA send failure is non-fatal */ }
          return
        }

        const candidates = (pendingLast?.candidate_projects || []).filter(
          (p) => !isStashedBuildingSearchRow(p)
        )
        if (candidates.length === 1) {
          await finalizeProjectSelection(candidates[0], sessionLang)
          if (openTicketAfterBuildingSearch) {
            session = await getActiveSession(from, supabaseAdmin, webhookClientId)
            residentLang = sessionLang
          } else {
            return
          }
        } else {
          await clearPendingSelection(from, supabaseAdmin, webhookClientId)
          try {
            await sendWa(waRecipient, 'ask_building', residentWhatsAppCreds, {}, sessionLang)
          } catch { /* WA send failure is non-fatal */ }
          return
        }
      }

      const pickedLang = parseLanguageButtonReplyId(interactiveReplyId)
      if (pickedLang) {
        residentLang = pickedLang
        await saveResidentLanguage(supabaseAdmin, webhookClientId, from, pickedLang, session?.id)
        const stashedSearch = await readStashedBuildingSearchText(from, supabaseAdmin, webhookClientId)
        if (stashedSearch) {
          await completeBuildingSearchForResident(stashedSearch, pickedLang)
          if (openTicketAfterBuildingSearch) {
            session = await getActiveSession(from, supabaseAdmin, webhookClientId)
            residentLang = pickedLang
          } else {
            return
          }
        } else {
          await continueAfterLanguageResolved(pickedLang)
          if (openTicketAfterBuildingSearch) {
            session = await getActiveSession(from, supabaseAdmin, webhookClientId)
            residentLang = pickedLang
          } else {
            return
          }
        }
      }
    }

    // Short status keywords — open tickets for this reporter + tenant
    if (!textBody.toUpperCase().startsWith('START_') && isStatusQuestion(textBody)) {
      const { data: openRows } = await supabaseAdmin
        .from('tickets')
        .select('ticket_number, status, workers ( full_name )')
        .eq('reporter_phone', from)
        .eq('client_id', webhookClientId)
        .is('deleted_at', null)
        .neq('status', 'CLOSED')
        .order('created_at', { ascending: false })
        .limit(5)

      const lines =
        openRows?.map((row: {
          ticket_number: number
          status: string
          workers?: { full_name?: string | null } | { full_name?: string | null }[] | null
        }) => {
          const w = Array.isArray(row.workers) ? row.workers[0] : row.workers
          let s = `תקלה #${row.ticket_number}: ${statusLabelHe(row.status)}.`
          if (isTicketInTreatment(row.status) && w?.full_name) {
            s += ` עובד ${w.full_name} מטפל.`
          }
          return s
        }) ?? []

      try {
        if (lines.length > 0) {
          await sendWa(waRecipient, 'ticket_status_list', residentWhatsAppCreds, {
            list: lines.join('\n'),
          })
        } else {
          await sendWa(waRecipient, 'no_open_tickets', residentWhatsAppCreds)
        }
      } catch { /* WA send failure is non-fatal */ }

      return
    }

    // Product rule: WhatsApp session is single-purpose and short-lived.
    // Free-text should never be auto-logged into a previous ticket; after reset, it restarts project search flow.
    // STEP 1: START_<PROJECT_CODE> or START_<PROJECT_CODE>_<BUILDING>
    if (textBody.toUpperCase().startsWith('START_')) {
      const parsedStart = parseStartCode(textBody)

      if (!parsedStart) {
        try {
          await sendWa(waRecipient, 'qr_invalid', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      const { projectCode, buildingNumber } = parsedStart

      logger.info('WEBHOOK', 'START flow', { projectCode, hasBuilding: !!buildingNumber })

      const { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .select('id, name, project_code')
        .eq('project_code', projectCode)
        .eq('client_id', webhookClientId)
        .maybeSingle()

      if (projectError) {
        logger.error('WEBHOOK', 'project lookup failed', new Error(projectError.message), { projectCode })
        try { await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds) } catch {}
        return
      }

      if (!project) {
        try {
          await sendWa(waRecipient, 'project_not_found', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      const { error: deactivateError } = await supabaseAdmin
        .from('sessions')
        .update({
          is_active: false,
          last_activity_at: new Date().toISOString(),
        })
        .eq('phone_number', from)
        .eq('client_id', webhookClientId)
        .eq('is_active', true)

      if (deactivateError) {
        // Non-fatal: old sessions may linger, but we still create a new one and reply
        logger.warn('WEBHOOK', 'deactivate old sessions failed (continuing)', { err: deactivateError.message })
      }

      const qrLang = await preferredLanguageForNewSession(
        supabaseAdmin,
        webhookClientId,
        from,
        residentLang
      )
      residentLang = qrLang

      const { data: createdSession, error: sessionInsertError } = await supabaseAdmin
        .from('sessions')
        .insert({
          phone_number: from,
          client_id: webhookClientId,
          project_id: project.id,
          is_active: true,
          active_ticket_id: null,
          preferred_language: qrLang,
          last_activity_at: new Date().toISOString(),
        })
        .select('id, phone_number, project_id, is_active, preferred_language')
        .single()

      if (sessionInsertError) {
        logger.error('WEBHOOK', 'session insert failed', new Error(sessionInsertError.message))
        try { await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds) } catch {}
        return
      }

      logger.info('WEBHOOK', 'session created', { sessionId: createdSession.id, project: project.name })

      await afterResidentSessionCreated(from, createdSession.id, supabaseAdmin, webhookClientId)

      try {
        const buildingLine = buildingNumber
          ? RESIDENT_UI_COPY[qrLang].buildingLine(buildingNumber)
          : ''
        await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
          project_name: project.name,
          building_line: buildingLine,
        }, qrLang)
      } catch { /* WA send failure is non-fatal */ }

      return
    }

    // Opt-in chatbot for one new tenant. Master env + client row both default off,
    // so every live number keeps the flow below. Any failure falls through.
    let clientAiChatOn = false
    try {
      clientAiChatOn = await isClientWhatsAppAiChatEnabled(supabaseAdmin, webhookClientId)
    } catch (chatGateErr) {
      logger.warn('WEBHOOK', 'WhatsApp AI chat gate failed; using existing flow', {
        err: chatGateErr instanceof Error ? chatGateErr.message : String(chatGateErr),
      })
    }
    if (clientAiChatOn) {
      try {
        const chatResult = await runClientWhatsAppAiChat({
          supabaseAdmin,
          clientId: webhookClientId,
          from,
          textBody,
          waCreds: residentWhatsAppCreds,
        })
        if (chatResult.kind === 'handled') return
        if (chatResult.kind === 'open_ticket') {
          openTicketAfterBuildingSearch = chatResult.description
          residentLang = chatResult.language
        }
      } catch (chatErr) {
        logger.warn('WEBHOOK', 'WhatsApp AI chat failed; using existing flow', {
          err: chatErr instanceof Error ? chatErr.message : String(chatErr),
        })
      }
    }

    const ticketPriority = resolveTicketPriorityFromResidentMessage(textBody)

    // סשן פעיל = אחרי סריקת QR או אחרי בחירת בניין בחיפוש (1/2/3 / התאמה אוטומטית)
    session = await getActiveSession(from, supabaseAdmin, webhookClientId)
    residentLang = await getResidentLanguage(supabaseAdmin, webhookClientId, from, session)

    // זיכרון דייר: אם הטלפון כבר ב-residents — דלג על QR / חיפוש בניין
    if (!session && !isTestWhatsAppSender) {
      const knownResident = await findApprovedResidentByPhoneClient(supabaseAdmin, webhookClientId, from)
      if (knownResident?.project_id) {
        await supabaseAdmin
          .from('sessions')
          .update({
            is_active: false,
            last_activity_at: new Date().toISOString(),
          })
          .eq('phone_number', from)
          .eq('client_id', webhookClientId)
          .eq('is_active', true)

        const sessionLang = await preferredLanguageForNewSession(
          supabaseAdmin,
          webhookClientId,
          from,
          residentLang
        )

        const { error: insErr } = await supabaseAdmin.from('sessions').insert({
          phone_number: from,
          client_id: webhookClientId,
          project_id: knownResident.project_id,
          is_active: true,
          active_ticket_id: null,
          preferred_language: sessionLang,
          last_activity_at: new Date().toISOString(),
        })

        if (!insErr) {
          session = await getActiveSession(from, supabaseAdmin, webhookClientId)
          residentLang = sessionLang
          if (session?.id) {
            await afterResidentSessionCreated(from, session.id, supabaseAdmin, webhookClientId)
          }
          if (session) {
            if (isClarificationQuestion(textBody)) {
              try {
                await sendWa(waRecipient, 'clarification_reply', residentWhatsAppCreds, {}, sessionLang)
              } catch { /* WA send failure is non-fatal */ }
              return
            }
            if (!looksLikeTicketDescription(textBody)) {
              try {
                await sendWa(waRecipient, 'resident_prompt', residentWhatsAppCreds, {
                  reporter_name: residentGreetingPrefix(sessionLang, knownResident.full_name),
                }, sessionLang)
              } catch { /* WA send failure is non-fatal */ }
              return
            }
            // else: fall through to ticket creation with textBody as description
          }
        }
      }
    }

    if (!session) {
      const isKnownResidentEarly =
        !isTestWhatsAppSender &&
        !!(await findApprovedResidentByPhoneClient(supabaseAdmin, webhookClientId, from))
      const isProjectListPick =
        !!interactiveReplyId &&
        (parseProjectListReplyId(interactiveReplyId) !== null ||
          parseLastProjectButtonReplyId(interactiveReplyId) !== null)

      // AI chatbot intake for unknown residents (replaces language→building FSM)
      if (!isKnownResidentEarly && isWhatsAppAiIntakeEnabled()) {
        const aiText =
          (textBody || '').trim() ||
          (parsedMessage.interactiveReplyTitle || '').trim() ||
          (interactiveReplyId || '').trim()
        if (!aiText) {
          return
        }
        try {
          const aiResult = await runUnknownResidentAiIntake({
            supabaseAdmin,
            clientId: webhookClientId,
            from,
            textBody: aiText,
            waCreds: residentWhatsAppCreds,
          })
          if (aiResult.kind === 'handled') {
            return
          }
          session = aiResult.session
          residentLang = aiResult.language
          openTicketAfterBuildingSearch = aiResult.description
        } catch (aiErr) {
          logger.warn('WEBHOOK', 'AI unknown-resident intake failed; falling back to FSM', {
            err: aiErr instanceof Error ? aiErr.message : String(aiErr),
          })
          // fall through to legacy FSM below
        }
      }

      // Legacy FSM — only when still no session (AI disabled, or AI failed)
      if (!session && !isKnownResidentEarly && !isProjectListPick) {
        const hasLang = await hasExplicitResidentLanguage(
          supabaseAdmin,
          webhookClientId,
          from,
          null
        )
        if (!hasLang) {
          if (messageContainsBuildingHint(textBody)) {
            await stashBuildingSearchText(from, textBody, supabaseAdmin, webhookClientId)
          } else if (looksLikeTicketDescription(textBody)) {
            await stashProblemDescription(from, textBody, supabaseAdmin, webhookClientId)
          }
          const inferred = inferResidentLanguageFromText(textBody)
          if (!inferred) {
            try {
              await sendWaLanguageButtons(waRecipient, residentWhatsAppCreds)
            } catch { /* WA send failure is non-fatal */ }
            return
          }
          await saveResidentLanguage(supabaseAdmin, webhookClientId, from, inferred, null)
          residentLang = inferred
          const stashedSearch = await readStashedBuildingSearchText(from, supabaseAdmin, webhookClientId)
          if (stashedSearch) {
            await completeBuildingSearchForResident(stashedSearch, inferred)
            if (openTicketAfterBuildingSearch) {
              session = await getActiveSession(from, supabaseAdmin, webhookClientId)
              residentLang = inferred
            } else {
              return
            }
          } else {
            await continueAfterLanguageResolved(inferred)
            if (openTicketAfterBuildingSearch) {
              session = await getActiveSession(from, supabaseAdmin, webhookClientId)
              residentLang = inferred
            } else {
              return
            }
          }
        }
      }

      // If AI already created a session for immediate ticket open, skip legacy pending/building steps
      if (session) {
        // fall through to ticket creation below
      } else {
      // STEP 2.5: PENDING SELECTION (list reply or numeric 1/2/3)
      let selectedIndex: number | null = null
      if (interactiveReplyId) {
        const listIdx = parseProjectListReplyId(interactiveReplyId)
        if (listIdx !== null) selectedIndex = listIdx
      } else {
        const numericSelection = isNumericSelection(textBody)
        if (numericSelection !== null) selectedIndex = numericSelection - 1
      }
      const pendingSelection = await getPendingSelection(from, supabaseAdmin, webhookClientId)

      if (selectedIndex !== null && pendingSelection) {
        const candidates = (pendingSelection.candidate_projects || []).filter(
          (p) => !isStashedBuildingSearchRow(p)
        )

        if (selectedIndex >= 0 && selectedIndex < candidates.length) {
          const selectedProject = candidates[selectedIndex]

          const sessionLang = pendingSelection.preferred_language?.trim()
            ? normalizeResidentLang(pendingSelection.preferred_language)
            : residentLang

          await finalizeProjectSelection(selectedProject, sessionLang)

          if (openTicketAfterBuildingSearch) {
            session = await getActiveSession(from, supabaseAdmin, webhookClientId)
            residentLang = sessionLang
          } else {
            return
          }
        } else {
          const sessionLang = pendingSelection.preferred_language?.trim()
            ? normalizeResidentLang(pendingSelection.preferred_language)
            : residentLang
          try {
            await sendWa(waRecipient, 'selection_invalid', residentWhatsAppCreds, {}, sessionLang)
            if (candidates.length > 0) {
              await sendWaInteractiveList(
                waRecipient,
                candidates,
                await resolveWaBodyForLang('building_list_body', sessionLang),
                residentWhatsAppCreds,
                sessionLang
              )
            }
          } catch { /* WA send failure is non-fatal */ }
          return
        }
      }

      // Pending selection + non-selection text: refine search matches only
      if (pendingSelection && selectedIndex === null) {
        const candidates = (pendingSelection.candidate_projects || []).filter(
          (p) => !isStashedBuildingSearchRow(p)
        )
        const sessionLang = pendingSelection.preferred_language?.trim()
          ? normalizeResidentLang(pendingSelection.preferred_language)
          : residentLang

        if (messageContainsBuildingHint(textBody)) {
          let refined = searchProjectsInList(candidates, textBody)
          if (refined.length === 0) {
            refined = await searchProjectsByBuilding(textBody, supabaseAdmin, webhookClientId)
          }

          if (refined.length === 1) {
            await finalizeProjectSelection(refined[0], sessionLang, textBody)
            if (openTicketAfterBuildingSearch) {
              session = await getActiveSession(from, supabaseAdmin, webhookClientId)
              residentLang = sessionLang
            } else {
              return
            }
          } else if (refined.length > 1) {
            await clearPendingSelection(from, supabaseAdmin, webhookClientId)
            const pendingCreated = await createPendingSelection(
              from,
              refined.slice(0, WA_PROJECT_LIST_MAX_ROWS),
              supabaseAdmin,
              webhookClientId,
              sessionLang
            )
            if (!pendingCreated) {
              try {
                await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
              } catch { /* WA send failure is non-fatal */ }
              return
            }
            try {
              await sendWaInteractiveList(
                waRecipient,
                refined.slice(0, WA_PROJECT_LIST_MAX_ROWS),
                await resolveWaBodyForLang('building_list_body', sessionLang),
                residentWhatsAppCreds,
                sessionLang
              )
            } catch { /* WA send failure is non-fatal */ }
            return
          } else {
            try {
              await sendWa(waRecipient, 'building_not_found', residentWhatsAppCreds, {}, sessionLang)
            } catch { /* WA send failure is non-fatal */ }
            return
          }
        } else {
          try {
            await sendWa(waRecipient, 'selection_invalid', residentWhatsAppCreds, {}, sessionLang)
            if (candidates.length > 0) {
              await sendWaInteractiveList(
                waRecipient,
                candidates,
                await resolveWaBodyForLang('building_list_body', sessionLang),
                residentWhatsAppCreds,
                sessionLang
              )
            }
          } catch { /* WA send failure is non-fatal */ }
          return
        }
      }

      if (!session) {
        if (isClarificationQuestion(textBody)) {
          const lang = await getResidentLanguage(supabaseAdmin, webhookClientId, from, null)
          try {
            await sendWa(waRecipient, 'clarification_reply', residentWhatsAppCreds, {}, lang)
          } catch { /* WA send failure is non-fatal */ }
          return
        }

        const lang = await getResidentLanguage(supabaseAdmin, webhookClientId, from, null)

        if (messageContainsBuildingHint(textBody)) {
          await completeBuildingSearchForResident(textBody, lang)
          if (openTicketAfterBuildingSearch) {
            session = await getActiveSession(from, supabaseAdmin, webhookClientId)
            residentLang = lang
          } else {
            return
          }
        } else {
          if (looksLikeTicketDescription(textBody)) {
            await stashProblemDescription(from, textBody, supabaseAdmin, webhookClientId)
          }
          try {
            await sendWa(waRecipient, 'ask_building', residentWhatsAppCreds, {}, lang)
          } catch { /* WA send failure is non-fatal */ }
          return
        }
      }
      } // end else: legacy pending/building (skipped when AI already set session)
    }

    if (!session) return

    // Product rule: never keep active_ticket_id for text follow-ups.
    // Session is only used to bridge: (project identified) -> (ticket description) -> ticket created.

    let ticketDescription: string | null = openTicketAfterBuildingSearch

    const knownResidentForSession =
      !isTestWhatsAppSender
        ? await findApprovedResidentByPhoneClient(supabaseAdmin, webhookClientId, from, session.project_id ?? undefined)
        : null

    if (!ticketDescription && !acceptTicketDescriptionInSession(textBody)) {
      try {
        await sendWa(waRecipient, 'resident_prompt', residentWhatsAppCreds, {
          reporter_name: residentGreetingPrefix(residentLang, knownResidentForSession?.full_name),
        })
      } catch { /* WA send failure is non-fatal */ }
      await supabaseAdmin
        .from('sessions')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', session.id)
      return
    }

    if (!ticketDescription) ticketDescription = textBody
    openTicketAfterBuildingSearch = null

    if (session.project_id) {
      const dupTicket = await findDuplicateOpenWhatsAppTicket(
        from,
        webhookClientId,
        ticketDescription,
        supabaseAdmin
      )
      if (dupTicket) {
        await supabaseAdmin
          .from('sessions')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', session.id)
        try {
          await sendWa(waRecipient, 'duplicate_ticket', residentWhatsAppCreds, {
            ticket_number: String(dupTicket.ticket_number),
          })
        } catch { /* WA send failure is non-fatal */ }
        return
      }
    }

    const { data: existingProject, error: existingProjectError } = await supabaseAdmin
      .from('projects')
      .select('project_code, qr_identifier')
      .eq('id', session.project_id)
      .eq('client_id', webhookClientId)
      .maybeSingle()

    if (existingProjectError) {
      logger.warn('WEBHOOK', 'fetch project for building extraction failed', { err: existingProjectError.message })
    }

    let buildingNumber: string | null = null

    if (existingProject?.qr_identifier) {
      const parsedStart = parseStartCode(existingProject.qr_identifier)
      buildingNumber = parsedStart?.buildingNumber || null
    }

    const reporterDisplayName = reporterDisplayNameForNotification(
      waRecipient,
      knownResidentForSession?.full_name
    )
    const reporterNameForTicket =
      knownResidentForSession?.full_name?.trim() &&
      knownResidentForSession.full_name.trim() !== 'דייר WhatsApp'
        ? knownResidentForSession.full_name.trim()
        : null

    const { data: createdTicket, error: ticketError } = await supabaseAdmin
      .from('tickets')
      .insert({
        client_id: webhookClientId,
        project_id: session.project_id,
        reporter_phone: from,
        reporter_name: reporterNameForTicket,
        description: ticketDescription,
        status: 'NEW',
        priority: ticketPriority,
        language: residentLang,
        source: 'whatsapp',
        building_number: buildingNumber,
      })
      .select('id, ticket_number, project_id, building_number')
      .single()

    if (ticketError) {
      const duplicateTicketNumber = parseRecentDuplicateWhatsAppTicketError(ticketError.message)
      if (duplicateTicketNumber) {
        logger.info('WEBHOOK', 'duplicate ticket blocked at insert', {
          ticketNumber: duplicateTicketNumber,
          clientId: webhookClientId,
        })
        await supabaseAdmin
          .from('sessions')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', session.id)
        try {
          await sendWa(waRecipient, 'duplicate_ticket', residentWhatsAppCreds, {
            ticket_number: String(duplicateTicketNumber),
          })
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      logger.error('WEBHOOK', 'ticket insert failed', new Error(ticketError.message))
      void logWebhookOperationalError('ticket_create', ticketError.message, webhookClientId, {
        requestId,
        phone: from,
        projectId: session.project_id,
      }, clientName)
      try {
        await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
      } catch { /* non-fatal */ }
      return
    }

    await attachPendingWhatsAppMediaToTicketIfAny(
      from,
      webhookClientId,
      createdTicket.id,
      supabaseAdmin,
      residentWhatsAppCreds.accessToken
    )
    const mediaRecoverResult = await recoverAllWhatsAppMediaForTicket(
      supabaseAdmin,
      webhookClientId,
      createdTicket.id,
      from,
      residentWhatsAppCreds.accessToken
    )
    if (mediaRecoverResult.recovered && (mediaRecoverResult.attachments_added ?? 0) > 0) {
      logger.info('WEBHOOK', 'media attached at ticket create via recovery', {
        ticketId: createdTicket.id,
        method: mediaRecoverResult.method,
        added: mediaRecoverResult.attachments_added,
      })
    }

    if (session.project_id) {
      void queuePendingResidentApproval({
        supabase: supabaseAdmin,
        clientId: webhookClientId,
        projectId: session.project_id as string,
        ticketId: createdTicket.id,
        waFrom: waRecipient,
        suggestedName: parsedMessage.profileName ?? null,
      })
    }

    if (session.project_id) {
      const autoAssign = await autoAssignTicketFromProject(supabaseAdmin, {
        ticketId: createdTicket.id,
        clientId: webhookClientId,
        projectId: session.project_id as string,
        ticketNumber: createdTicket.ticket_number as number,
        description: ticketDescription || null,
        smsSenderName,
      })
      if (autoAssign.assigned && autoAssign.assign && !autoAssign.assign.ok) {
        logger.warn('WEBHOOK', 'auto-assign from project failed', {
          ticketId: createdTicket.id,
          workerId: autoAssign.workerId,
          err: autoAssign.assign.error,
        })
      } else if (autoAssign.assigned) {
        logger.info('WEBHOOK', 'auto-assigned ticket from project worker', {
          ticketNumber: createdTicket.ticket_number,
          workerId: autoAssign.workerId,
        })
      }
    }

    // Predictive alert — fire-and-forget, never blocks the response
    void checkAndFlagRecurringIssue({
      supabase: supabaseAdmin,
      ticketId: createdTicket.id,
      clientId: webhookClientId,
      projectId: session.project_id as string,
      projectName: '',
      reporterPhone: from,
      ticketNumber: createdTicket.ticket_number,
      clientManagerPhone: clientManagerPhone ?? null,
      smsSenderName: smsSenderName ?? null,
    }).catch((e) => logger.warn('WEBHOOK', 'predictive-alert error', { err: e instanceof Error ? e.message : String(e) }))

    const { error: logError } = await supabaseAdmin
      .from('ticket_logs')
      .insert({
        ticket_id: createdTicket.id,
        action_type: 'CREATED_FROM_WHATSAPP',
        notes: `Ticket opened from WhatsApp by ${from}`,
        created_by: 'system',
        meta: {
          phone: from,
          source: 'whatsapp',
          building_number: buildingNumber,
        },
      })

    if (logError) {
      logger.warn('WEBHOOK', 'ticket_logs insert failed (non-blocking)', { err: logError.message })
    }

    logger.info('WEBHOOK', 'ticket created', { ticketNumber: createdTicket.ticket_number, clientId: webhookClientId })

    try {
      const { data: projectForNotification, error: projectNotificationError } = await supabaseAdmin
        .from('projects')
        .select('name, manager_phone, assigned_worker_id')
        .eq('id', session.project_id)
        .eq('client_id', webhookClientId)
        .single()

      if (projectNotificationError) {
        logger.warn('WEBHOOK', 'fetch project for notification failed', { err: projectNotificationError.message })
      } else if (projectForNotification) {
        const buildingLine = buildingNumber ? `בניין: ${buildingNumber}\n` : ''
        const smsMessage = await resolveSmsTemplateMessage(
          supabaseAdmin, webhookClientId,
          'sms_manager_new_ticket',
          SMS_TEMPLATE_EDITOR_DEFAULTS.sms_manager_new_ticket,
          {
            project_name: projectForNotification.name,
            building_line: buildingLine,
            ticket_number: String(createdTicket.ticket_number),
            description: ticketDescription || 'ללא פירוט',
            reporter_name: reporterDisplayName,
            dashboard_url: getPublicTicketsUrl(),
            client_name: clientName,
          }
        )

        if (smsOnTicketOpen) {
          const managerDestination = clientManagerPhone || projectForNotification.manager_phone || getManagerPhoneFromEnv()

          if (managerDestination) {
            const smsSent = await sendManagerSMS(managerDestination, smsMessage, smsSenderName, webhookClientId)
            if (!smsSent) {
              logger.warn('WEBHOOK', 'manager SMS failed', { ticketNumber: createdTicket.ticket_number })
            }
          }

          if (smsOnTicketOpen) {
            await notifyAlertWorkersOnNewTicket(supabaseAdmin, webhookClientId, {
              project_name: projectForNotification.name,
              ticket_number: createdTicket.ticket_number,
              description: ticketDescription || 'ללא פירוט',
              reporter_name: reporterDisplayName,
              sms_sender_name: smsSenderName,
              client_name: clientName,
            })
          }
        }

        void notifyNewTicketPush(
          supabaseAdmin,
          webhookClientId,
          ticketDescription || 'ללא פירוט',
          { ticketNumber: createdTicket.ticket_number }
        ).catch((pushErr) =>
          logger.warn('WEBHOOK', 'new-ticket push failed', {
            err: pushErr instanceof Error ? pushErr.message : String(pushErr),
          })
        )
      }
    } catch (notifyManagerError) {
      logger.warn('WEBHOOK', 'manager notification error', { err: notifyManagerError instanceof Error ? notifyManagerError.message : String(notifyManagerError) })
    }

    try {
      const buildingText = buildingNumber ? `\nבניין: ${buildingNumber}` : ''

      const { data: projRow } = await supabaseAdmin
        .from('projects')
        .select('name')
        .eq('id', session.project_id)
        .eq('client_id', webhookClientId)
        .maybeSingle()

      const projectNameForWa = (projRow as { name?: string } | null)?.name || ''

      let ticketOpenedBody = resolveMessageForLanguage(
        await resolveWhatsAppTemplateMessage(
          supabaseAdmin,
          webhookClientId,
          'ticket_opened',
          WHATSAPP_TEMPLATE_EDITOR_DEFAULTS['ticket_opened'],
          {
            building_line: buildingText,
            ticket_number: String(createdTicket.ticket_number),
            description: ticketDescription || '',
            reporter_name: reporterDisplayName,
            project_name: projectNameForWa,
          }
        ),
        residentLang
      )

      if (
        session.project_id &&
        !isTestWhatsAppSender &&
        !(await reporterListedInProjectResidents(
          supabaseAdmin,
          webhookClientId,
          session.project_id as string,
          waRecipient
        ))
      ) {
        const pendingNote = resolveMessageForLanguage(
          await resolveWhatsAppTemplateMessage(
            supabaseAdmin,
            webhookClientId,
            'pending_approval_note',
            WHATSAPP_TEMPLATE_EDITOR_DEFAULTS['pending_approval_note'],
            {}
          ),
          residentLang
        )
        ticketOpenedBody += pendingNote
      }

      await sendWhatsAppTextMessage(
        waRecipient,
        ticketOpenedBody,
        residentWhatsAppCreds,
        { clientId: webhookClientId }
      )
    } catch { /* WA send failure is non-fatal; ticket was already created */ }

    // Product rule: if no image is sent, session must reset after ticket creation confirmation.
    // If an image is sent later, it will attach to the most recent open ticket for this phone.
    await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'ticket_created_text_flow_reset')

    return

  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    logger.error('WEBHOOK', 'Inbound background error', e, { requestId })
    void logWebhookOperationalError('unhandled', e.message, undefined, {
      requestId,
      stack: e.stack?.slice(0, 2000),
    })
    // Audit #12: surface failure so the route can return non-2xx and reclaim dedupe.
    throw e
  }
}

