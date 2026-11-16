'use client'

import { theme } from '@/app/components/ui/theme'
import { requestDashboardAddTicket } from './dashboard-shell-events'

const addButtonStyle = {
  background: theme.colors.primary,
  color: theme.colors.textInverse,
  border: 'none',
  borderRadius: theme.radius.md,
  padding: '12px 18px',
  fontWeight: 600,
  fontSize: 16,
  lineHeight: 1.2,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: theme.shadows.primaryBtn,
} as const

export function DashboardAddTicketButton() {
  return (
    <button type="button" onClick={requestDashboardAddTicket} style={addButtonStyle}>
      + תקלה חדשה
    </button>
  )
}