'use client'

import type { CSSProperties } from 'react'
import type { PaidAddonId } from '@/lib/paid-addons-catalog'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
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

function ProfessionalsMock() {
  const rows = [
    { name: 'יוסי כהן — חשמל', phone: '052-xxx' },
    { name: 'מעליות דן', phone: '03-xxx' },
    { name: 'אבי — אינסטלציה', phone: '054-xxx' },
  ]
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>אנשי מקצוע</span>
        <span style={styles.mockPill}>SMS</span>
      </div>
      <ul style={styles.proList}>
        {rows.map((r) => (
          <li key={r.name} style={styles.proRow}>
            <span style={styles.proName}>{r.name}</span>
            <span style={styles.proPhone}>{r.phone}</span>
          </li>
        ))}
      </ul>
      <div style={styles.smsBubble}>
        <span style={styles.smsLabel}>הודעה לקבלן</span>
        <span style={styles.smsText}>תקלה #1247 · בניין א׳ · דירה 12...</span>
      </div>
    </div>
  )
}

function CalendarMock() {
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>יומן משרד</span>
        <span style={styles.mockPill}>חודש</span>
      </div>
      <div style={styles.calGrid}>
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            style={{
              ...styles.calCell,
              ...(i === 8 ? { background: theme.colors.primaryMuted, borderColor: theme.colors.primary } : {}),
            }}
          />
        ))}
      </div>
      <div style={styles.calEvent}>
        <span style={styles.calEventTitle}>ועד בית — בניין א׳</span>
        <span style={styles.calEventTime}>10:00</span>
      </div>
    </div>
  )
}

function PilotSmsMock() {
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>SMS פיילוט</span>
        <span style={styles.mockPill}>142 נמענים</span>
      </div>
      <div style={styles.smsBubble}>
        <span style={styles.smsLabel}>ברוכים הבאים למוקד התקלות</span>
        <span style={styles.smsText}>שמרו את המספר לדיווח תקלות בבניין...</span>
      </div>
      <p style={styles.mockFooter}>עברית · English · Francais</p>
    </div>
  )
}

function DocumentsMock() {
  const files = ['חוזה אחזקה.pdf', 'תוכנית חשמל.dwg', 'פרוטוקול ועד.docx']
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>תיקיית מסמכים</span>
        <span style={styles.mockPill}>3 קבצים</span>
      </div>
      <ul style={styles.proList}>
        {files.map((f) => (
          <li key={f} style={styles.proRow}>
            <span style={styles.proName}>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WhatsappInboxMock() {
  const chats = [
    { name: 'דירה 12 · בניין א׳', preview: 'יש רטיבות במקלחת...' },
    { name: 'ועד בית', preview: 'מתי טכנאי מגיע?' },
  ]
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>תיבת WhatsApp</span>
        <span style={styles.mockPill}>2 פתוחות</span>
      </div>
      <ul style={styles.proList}>
        {chats.map((c) => (
          <li key={c.name} style={{ ...styles.proRow, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={styles.proName}>{c.name}</span>
            <span style={{ fontSize: 9, color: theme.colors.textMuted }}>{c.preview}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CampaignsMock() {
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>קמפיינים SMS</span>
        <span style={styles.mockPill}>84 נמענים</span>
      </div>
      <div style={styles.smsBubble}>
        <span style={styles.smsLabel}>הודעה לבניין</span>
        <span style={styles.smsText}>עבודות תחזוקה ביום ג׳ 09:00–14:00. מעלית B לא פעילה.</span>
      </div>
      <p style={styles.mockFooter}>שליחה לכל דיירי הפרויקט</p>
    </div>
  )
}

function WorkerStampMock() {
  return (
    <div style={styles.mockFrame}>
      <div style={styles.mockHeader}>
        <span style={styles.mockTitle}>חתמת עובדים</span>
        <span style={styles.mockPill}>היום</span>
      </div>
      <div style={styles.kpiRow}>
        <div style={styles.kpi}>
          <span style={styles.kpiVal}>4</span>
          <span style={styles.kpiLbl}>במשמרת</span>
        </div>
        <div style={styles.kpi}>
          <span style={styles.kpiVal}>31</span>
          <span style={styles.kpiLbl}>שעות</span>
        </div>
        <div style={styles.kpi}>
          <span style={styles.kpiVal}>12</span>
          <span style={styles.kpiLbl}>אירועים</span>
        </div>
      </div>
      <div style={styles.qrBox}>
        <div style={styles.qrPattern} />
        <span style={styles.qrCaption}>סריקת QR / NFC בשטח</span>
      </div>
    </div>
  )
}

function renderMock(addonId: PaidAddonId) {
  switch (addonId) {
    case PAID_ADDON_KEYS.calendar:
      return <CalendarMock />
    case PAID_ADDON_KEYS.professionals:
      return <ProfessionalsMock />
    case PAID_ADDON_KEYS.worker_stamp:
      return <WorkerStampMock />
    case PAID_ADDON_KEYS.pilot_sms:
      return <PilotSmsMock />
    case PAID_ADDON_KEYS.project_documents:
      return <DocumentsMock />
    case PAID_ADDON_KEYS.whatsapp_inbox:
      return <WhatsappInboxMock />
    case PAID_ADDON_KEYS.campaigns:
      return <CampaignsMock />
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
  proList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  },
  proRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    padding: '6px 8px',
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
  },
  proName: { fontWeight: 600, color: theme.colors.textPrimary },
  proPhone: { color: theme.colors.textMuted, direction: 'ltr' },
  smsBubble: {
    padding: '8px 10px',
    borderRadius: theme.radius.md,
    background: theme.colors.primaryMuted,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  smsLabel: { fontSize: 9, fontWeight: 700, color: theme.colors.primary },
  smsText: { fontSize: 9, color: theme.colors.textSecondary, lineHeight: 1.35 },
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
    minHeight: 72,
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
  calGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 4,
    flex: 1,
  },
  calCell: {
    aspectRatio: '1',
    borderRadius: 4,
    background: theme.colors.muted,
    border: `1px solid ${theme.colors.border}`,
  },
  calEvent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 8px',
    borderRadius: theme.radius.md,
    background: theme.colors.primaryMuted,
    fontSize: 10,
  },
  calEventTitle: { fontWeight: 600, color: theme.colors.textPrimary },
  calEventTime: { color: theme.colors.textMuted },
  mockFooter: {
    margin: 0,
    fontSize: 9,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
}
