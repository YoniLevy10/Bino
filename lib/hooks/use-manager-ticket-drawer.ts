'use client'

import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { fetchTicketForDetail } from '@/lib/fetch-ticket-for-detail'
import { useTicketDetailData } from '@/lib/hooks/use-ticket-detail-data'
import { summaryTicketToDetail } from '@/lib/summary-ticket-detail'
import type { SummaryTicketRow } from '@/lib/summary-tickets'
import type { TicketDetailRow } from '@/lib/ticket-detail-types'
import { asyncHandler, toast } from '@/lib/error-handler'
import { TM } from '@/lib/toast-messages'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { toastReporterClosedNotifySummary } from '@/lib/reporter-closed-notify-toast'

type OpenOpts = { toggle?: boolean }

/** Inline ticket detail drawer for summary / history (no navigation to /tickets). */
export function useManagerTicketDrawer(opts?: { onRefresh?: () => void | Promise<void> }) {
  const [selectedTicket, setSelectedTicket] = useState<TicketDetailRow | null>(null)
  const [draftWorkerId, setDraftWorkerId] = useState('')
  const [draftStatus, setDraftStatus] = useState('')
  const [draftPriority, setDraftPriority] = useState('LOW')
  const [savingTicket, setSavingTicket] = useState(false)
  const [openingTicketId, setOpeningTicketId] = useState<string | null>(null)

  const {
    attachments: selectedTicketAttachments,
    ticketLogs,
    loadingAttachments,
    drawerLoading,
    recoveringMedia,
    loadTicketDrawerData,
    recoverAndReloadAttachments,
    resetTicketDetailData,
  } = useTicketDetailData()

  const closeDrawer = useCallback(() => {
    setSelectedTicket(null)
    setDraftWorkerId('')
    setDraftStatus('')
    setDraftPriority('LOW')
    resetTicketDetailData()
  }, [resetTicketDetailData])

  const openTicketRow = useCallback(
    (row: SummaryTicketRow | TicketDetailRow, openOpts?: OpenOpts) => {
      const detail = 'client_id' in row && row.client_id != null
        ? (row as TicketDetailRow)
        : summaryTicketToDetail(row as SummaryTicketRow)

      if (openOpts?.toggle && selectedTicket?.id === detail.id) {
        closeDrawer()
        return
      }

      setSelectedTicket(detail)
      setDraftWorkerId(detail.assigned_worker_id || '')
      setDraftStatus(detail.status)
      setDraftPriority(detail.priority || 'LOW')
      resetTicketDetailData()
      void loadTicketDrawerData(detail)
    },
    [selectedTicket?.id, closeDrawer, resetTicketDetailData, loadTicketDrawerData]
  )

  const openTicketById = useCallback(
    async (ticketId: string) => {
      if (openingTicketId) return
      setOpeningTicketId(ticketId)
      try {
        const clientId = await resolveBamakorClientIdForBrowser()
        const fetched = await fetchTicketForDetail(supabase, clientId, ticketId)
        if (fetched) openTicketRow(fetched)
        else toast.error('התקלה לא נמצאה')
      } finally {
        setOpeningTicketId(null)
      }
    },
    [openTicketRow, openingTicketId]
  )

  const saveTicket = useCallback(async () => {
    if (!selectedTicket) return
    setSavingTicket(true)
    await asyncHandler(
      async () => {
        const { saveDashboardTicket } = await import('@/lib/dashboard-ticket-save')
        const { didAssign, closedNow, reporter_has_phone, whatsapp_sent, notifications_queued } =
          await saveDashboardTicket({
          ticketId: selectedTicket.id,
          priority: draftPriority,
          status: draftStatus,
          previousStatus: selectedTicket.status,
          draftWorkerId,
          previousWorkerId: selectedTicket.assigned_worker_id,
        })
        if (closedNow) toast.success(TM.ticketClosed)
        else if (didAssign) toast.success(TM.workerAssigned)
        else toast.success(TM.ticketUpdated)

        if (closedNow) {
          toastReporterClosedNotifySummary({
            success: true,
            reporter_has_phone,
            whatsapp_sent,
            notifications_queued,
          })
          closeDrawer()
        } else {
          setSelectedTicket((prev) =>
            prev
              ? {
                  ...prev,
                  priority: draftPriority,
                  status: draftStatus,
                  assigned_worker_id: draftWorkerId || null,
                }
              : prev
          )
        }
        await opts?.onRefresh?.()
        return true
      },
      { context: 'שמירת התקלה', showErrorToast: true }
    )
    setSavingTicket(false)
  }, [selectedTicket, draftPriority, draftStatus, draftWorkerId, closeDrawer, opts])

  const closeTicket = useCallback(async () => {
    if (!selectedTicket) return
    setSavingTicket(true)
    await asyncHandler(
      async () => {
        const response = await fetchWithTimeout(
          '/api/close-ticket',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_id: selectedTicket.id }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const body = (await response.json().catch(() => ({}))) as {
          error?: string
          success?: boolean
          reporter_has_phone?: boolean
          whatsapp_sent?: boolean | null
          notifications_queued?: boolean
        }
        if (!response.ok) throw new Error(body.error || TM.genericSaveError)
        toast.success(TM.ticketClosed)
        toastReporterClosedNotifySummary({ ...body, success: true })
        closeDrawer()
        await opts?.onRefresh?.()
        return true
      },
      { context: 'סגירת התקלה', showErrorToast: true }
    )
    setSavingTicket(false)
  }, [selectedTicket, closeDrawer, opts])

  return {
    selectedTicket,
    openingTicketId,
    selectedTicketAttachments,
    ticketLogs,
    loadingAttachments,
    drawerLoading,
    recoveringMedia,
    draftWorkerId,
    draftStatus,
    draftPriority,
    savingTicket,
    openTicketRow,
    openTicketById,
    closeDrawer,
    saveTicket,
    closeTicket,
    setDraftWorkerId,
    setDraftStatus,
    setDraftPriority,
    recoverAndReloadAttachments,
  }
}
