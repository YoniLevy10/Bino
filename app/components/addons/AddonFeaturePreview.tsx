'use client'

import type { CSSProperties } from 'react'
import type { PaidAddonId } from '@/lib/paid-addons-catalog'
import { theme } from '../ui'

function LockOverlay() {
  return (
    <div style={styles.overlay} aria-hidden>
      <div style={styles.lockCircle}>
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
          <rect width="14" height="10" x="5" y="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <span style={styles.overlayLabel}>פיצ&apos;ר בתשלום</span>
    </div>
  )
}

function CalendarMock() {
  const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>יוני 2026</span>
        <span style={styles.mockPill}>חודש</span>
      </div>
      <div style={styles.calWeekRow}>
        {days.map((d) => (
          <span key={d} style={styles.calDow}>
            {d}
          </span>
        ))}
      </div>
      <div style={styles.calGrid}>
        {Array.from({ length: 28 }, (_, i) => (
          <div key={i} style={styles.calCell}>
            <span style={styles.calNum}>{i + 1}</span>
            {(i === 4 || i === 11 || i === 18) && <span style={styles.calDot} />}
          </div>
        ))}
      </div>
      <div style={styles.mockFooter}>
        <span style={styles.eventChip}>ועד בית · 10:00</span>
        <span style={{ ...styles.eventChip, background: theme.colors.successMuted }}>אחזקה · 14:30</span>
      </div>
    </div>
  )
}

function AttendanceMock() {
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>שעון עובדים</span>
        <span style={styles.mockPill}>היום</span>
      </div>
      <div style={styles.kpiRow}>
        <div style={styles.kpi}>
          <span style={styles.kpiVal}>3</span>
          <span style={styles.kpiLbl}>במשמרת</span>
        </div>
        <div style={styles.kpi}>
          <span style={styles.kpiVal}>24.5</span>
          <span style={styles.kpiLbl}>שעות</span>
        </div>
        <div style={styles.kpi}>
          <span style={styles.kpiVal}>8</span>
          <span style={styles.kpiLbl}>עובדות</span>
        </div>
      </div>
      <div style={styles.qrBox}>
        <div style={styles.qrPattern} />
        <span style={styles.qrCaption}>סריקת QR בכניסה למשרד</span>
      </div>
    </div>
  )
}

function PilotSmsMock() {
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>SMS פיילוט</span>
        <span style={styles.mockPill}>פרויקט</span>
      </div>
      <div style={{ ...styles.kpi, textAlign: 'right', padding: 12 }}>
        <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 6 }}>נמענים: 48 דיירים</div>
        <div style={{ fontSize: 10, lineHeight: 1.4, color: theme.colors.textSecondary }}>
          שלום וברכה, כאן מוקד התקלות של במקור...
        </div>
      </div>
    </div>
  )
}

function DocumentsMock() {
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>תיקיית מסמכים</span>
      </div>
      <ul style={{ margin: 0, padding: '8px 12px 12px 28px', fontSize: 10, color: theme.colors.textSecondary }}>
        <li>חוזה אחזקה.pdf</li>
        <li>תוכנית קומות.dwg</li>
        <li>פרוטוקול ועד.docx</li>
      </ul>
    </div>
  )
}

function renderMock(addonId: PaidAddonId) {
  switch (addonId) {
    case 'calendar':
      return <CalendarMock />
    case 'attendance':
      return <AttendanceMock />
    case 'pilot_sms':
      return <PilotSmsMock />
    case 'project_documents':
      return <DocumentsMock />
    default:
      return <CalendarMock />
  }
}

export function AddonFeaturePreview({
  addonId,
  locked = true,
}: {
  addonId: PaidAddonId
  locked?: boolean
}) {
  return (
    <div style={styles.previewWrap}>
      {renderMock(addonId)}
      {locked ? <LockOverlay /> : null}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  previewWrap: {
    position: 'relative',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    aspectRatio: '16 / 10',
    width: '100%',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    background: 'rgba(15, 23, 42, 0.55)',
    backdropFilter: 'blur(2px)',
  },
  lockCircle: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid rgba(255,255,255,0.35)',
  },
  overlayLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
  },
  mockFrame: {
    padding: 12,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    filter: 'blur(0.3px)',
  },
  mockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mockTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  mockPill: {
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: theme.radius.full,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
    fontWeight: 600,
  },
  calWeekRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2,
  },
  calDow: {
    fontSize: 9,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontWeight: 600,
  },
  calGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2,
    flex: 1,
  },
  calCell: {
    fontSize: 9,
    textAlign: 'center',
    padding: 2,
    borderRadius: 4,
    background: theme.colors.muted,
    position: 'relative',
    minHeight: 22,
  },
  calNum: { color: theme.colors.textSecondary },
  calDot: {
    display: 'block',
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: theme.colors.primary,
    margin: '2px auto 0',
  },
  mockFooter: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  eventChip: {
    fontSize: 9,
    padding: '2px 6px',
    borderRadius: 4,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
    fontWeight: 600,
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
  },
  kpi: {
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
    padding: '8px 4px',
    textAlign: 'center',
  },
  kpiVal: {
    display: 'block',
    fontSize: 16,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  kpiLbl: {
    fontSize: 9,
    color: theme.colors.textMuted,
  },
  qrBox: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
    minHeight: 80,
  },
  qrPattern: {
    width: 56,
    height: 56,
    borderRadius: 6,
    background: `repeating-linear-gradient(
      45deg,
      ${theme.colors.textPrimary} 0 2px,
      transparent 2px 6px
    ),
    repeating-linear-gradient(
      -45deg,
      ${theme.colors.textPrimary} 0 2px,
      transparent 2px 6px
    )`,
    opacity: 0.25,
  },
  qrCaption: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: 600,
  },
}
