'use client'

import type { CSSProperties } from 'react'
import { theme } from '../ui'
import { getFixlyStatusPresentation } from '@/lib/fixly'

type Props = {
  fixlyJobId: string | null | undefined
  fixlyStatus: string | null | undefined
  providerName?: string | null
  providerPhone?: string | null
  syncedAt?: string | null
}

function relativeHe(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000))
  if (mins < 1) return 'עודכן עכשיו'
  if (mins < 60) return `עודכן לפני ${mins} דק׳`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `עודכן לפני ${hours} שע׳`
  return `עודכן ב-${new Date(iso).toLocaleString('he-IL')}`
}

export function FixlyStatusBanner({
  fixlyJobId,
  fixlyStatus,
  providerName,
  providerPhone,
  syncedAt,
}: Props) {
  if (!fixlyJobId) return null

  const ui = getFixlyStatusPresentation(fixlyStatus)
  const toneStyle = toneColors(ui.tone)

  return (
    <div style={{ ...styles.banner, ...toneStyle }} role="status">
      <div style={styles.title}>Fixly — {ui.labelHe}</div>
      {(providerName || providerPhone) && (
        <div style={styles.meta}>
          {[providerName, providerPhone].filter(Boolean).join(' · ')}
        </div>
      )}
      <div style={styles.footer}>
        {fixlyStatus ? `סטטוס: ${fixlyStatus}` : null}
        {syncedAt ? ` · ${relativeHe(syncedAt)}` : null}
      </div>
    </div>
  )
}

function toneColors(tone: string): CSSProperties {
  switch (tone) {
    case 'warning':
      return { background: theme.colors.warningMuted, borderColor: theme.colors.warning, color: '#8A5A00' }
    case 'info':
      return { background: theme.colors.infoMuted, borderColor: theme.colors.primary, color: theme.colors.primaryActive }
    case 'success':
      return { background: theme.colors.successMuted, borderColor: theme.colors.success, color: '#187A34' }
    case 'danger':
      return { background: theme.colors.errorMuted, borderColor: theme.colors.error, color: theme.colors.error }
    default:
      return { background: theme.colors.muted, borderColor: theme.colors.borderStrong, color: theme.colors.textSecondary }
  }
}

const styles: Record<string, CSSProperties> = {
  banner: {
    border: '1px solid',
    borderRadius: theme.radius.md,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    fontSize: '14px',
    fontWeight: 700,
  },
  meta: {
    fontSize: '13px',
    fontWeight: 600,
  },
  footer: {
    fontSize: '12px',
    opacity: 0.85,
  },
}
