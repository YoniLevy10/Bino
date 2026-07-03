'use client'

import { ActionConfirmSheet } from '../ui/ActionConfirmSheet'

type CloseTicketConfirmSheetProps = {
  open: boolean
  ticketNumber: number
  loading?: boolean
  isMobile?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function CloseTicketConfirmSheet({
  open,
  ticketNumber,
  loading,
  isMobile,
  onConfirm,
  onCancel,
}: CloseTicketConfirmSheetProps) {
  return (
    <ActionConfirmSheet
      open={open}
      title={`לסגור תקלה #${ticketNumber}?`}
      body="התקלה תוסר מרשימת התקלות הפעילות ותירשם בהיסטוריית הפרויקט. הדייר והמנהל/ת עשויים לקבל הודעה."
      confirmLabel="סגור תקלה"
      cancelLabel="ביטול"
      confirmVariant="danger"
      loading={loading}
      isMobile={isMobile}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
