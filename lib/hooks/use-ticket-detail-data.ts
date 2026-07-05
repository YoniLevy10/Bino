'use client'

import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { withSignedAttachmentUrls } from '@/lib/ticket-attachment-url'
import { recoverWhatsAppMediaForTicket } from '@/lib/recover-ticket-media-client'
import { toast } from '@/lib/error-handler'
import type { TicketDetailAttachment, TicketDetailLog } from '@/lib/ticket-detail-types'

export type TicketDetailDataTicketRef = {
  id: string
  reporter_phone?: string | null
  status: string
}

const ATTACHMENT_SELECT =
  'id, ticket_id, file_name, file_url, mime_type, attachment_type, whatsapp_media_id, created_at'

/** Shared attachment / log / recover logic for manager ticket detail drawers. */
export function useTicketDetailData() {
  const [attachments, setAttachments] = useState<TicketDetailAttachment[]>([])
  const [ticketLogs, setTicketLogs] = useState<TicketDetailLog[]>([])
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [recoveringMedia, setRecoveringMedia] = useState(false)

  const tryRecoverWhatsAppMedia = useCallback(async (ticketId: string): Promise<boolean> => {
    setRecoveringMedia(true)
    try {
      const { recovered, error } = await recoverWhatsAppMediaForTicket(ticketId)
      if (!recovered) {
        if (error) toast.error(error)
        return false
      }
      toast.success('תמונה/וידאו שוחזרו מהסשן וצורפו לתקלה')
      return true
    } catch {
      return false
    } finally {
      setRecoveringMedia(false)
    }
  }, [])

  const loadTicketAttachments = useCallback(
    async (ticket: TicketDetailDataTicketRef) => {
      setLoadingAttachments(true)
      try {
        const { data, error } = await supabase
          .from('ticket_attachments')
          .select(ATTACHMENT_SELECT)
          .eq('ticket_id', ticket.id)
          .order('created_at', { ascending: false })

        if (error) throw error

        const rows = data

        if (rows && rows.length > 0) {
          const withUrls = await withSignedAttachmentUrls(supabase, rows as TicketDetailAttachment[])
          setAttachments(withUrls)
        } else {
          setAttachments([])
        }
      } catch {
        setAttachments([])
      } finally {
        setLoadingAttachments(false)
      }
    },
    []
  )

  const loadTicketLogs = useCallback(async (ticketId: string) => {
    setDrawerLoading(true)
    try {
      const { data, error } = await supabase
        .from('ticket_logs')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setTicketLogs((data as TicketDetailLog[]) || [])
    } catch {
      setTicketLogs([])
    } finally {
      setDrawerLoading(false)
    }
  }, [])

  const loadTicketDrawerData = useCallback(
    async (ticket: TicketDetailDataTicketRef) => {
      setTicketLogs([])
      await loadTicketLogs(ticket.id)
      await loadTicketAttachments(ticket)
    },
    [loadTicketAttachments, loadTicketLogs]
  )

  const recoverAndReloadAttachments = useCallback(
    async (ticket: TicketDetailDataTicketRef) => {
      const ok = await tryRecoverWhatsAppMedia(ticket.id)
      await loadTicketAttachments(ticket)
      return ok
    },
    [loadTicketAttachments, tryRecoverWhatsAppMedia]
  )

  const resetTicketDetailData = useCallback(() => {
    setAttachments([])
    setTicketLogs([])
  }, [])

  return {
    attachments,
    setAttachments,
    ticketLogs,
    loadingAttachments,
    drawerLoading,
    recoveringMedia,
    tryRecoverWhatsAppMedia,
    loadTicketAttachments,
    loadTicketLogs,
    loadTicketDrawerData,
    recoverAndReloadAttachments,
    resetTicketDetailData,
  }
}
