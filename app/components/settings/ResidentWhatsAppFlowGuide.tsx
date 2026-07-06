'use client'

import type { CSSProperties } from 'react'
import { theme } from '../ui'

const FLOWS = [
  {
    title: 'דייר חדש — זרימה מהירה',
    color: '#2563eb',
    steps: [
      { label: '1. שפה', template: 'choose_language' },
      { label: '2. בניין', template: 'ask_building → last_project_confirm / building_list_body' },
      { label: '3. תקלה', template: 'session_created → ticket_opened' },
      { label: '4. מדיה (אופציונלי)', template: 'image_attached / video_attached' },
    ],
  },
  {
    title: 'דייר מוכר',
    color: '#059669',
    steps: [
      { label: 'תיאור', template: 'resident_prompt' },
      { label: 'אישור', template: 'ticket_opened' },
    ],
  },
  {
    title: 'מעקב',
    color: '#7c3aed',
    steps: [
      { label: 'סטטוס', template: 'ticket_status_list / no_open_tickets' },
      { label: 'סגירה', template: 'ticket_closed' },
    ],
  },
] as const

export function ResidentWhatsAppFlowGuide() {
  return (
    <div style={styles.wrap}>
      <h2 style={styles.title}>מפת זרימה — דייר ב-WhatsApp</h2>
      <p style={styles.sub}>
        לכל שלב יש תבנית לעריכה למטה. אחרי שהדייר בוחר שפה,{' '}
        <strong>רק השדה של אותה שפה</strong> נשלח (עברית / Français / English).
        תבנית <code style={styles.code}>choose_language</code> היא יוצאת דופן — שלוש השפות יחד
        לפני הבחירה.
      </p>
      <div style={styles.grid}>
        {FLOWS.map((flow) => (
          <div key={flow.title} style={styles.card}>
            <div style={{ ...styles.cardTitle, color: flow.color }}>{flow.title}</div>
            <ol style={styles.ol}>
              {flow.steps.map((s) => (
                <li key={s.label} style={styles.li}>
                  <span>{s.label}</span>
                  <code style={styles.stepCode}>{s.template}</code>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    marginBottom: 24,
    padding: '16px 18px',
    borderRadius: theme.radius.lg,
    border: `1.5px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  title: { fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: theme.colors.textPrimary },
  sub: { fontSize: 13, lineHeight: 1.5, margin: '0 0 14px', color: theme.colors.textMuted },
  code: {
    fontSize: 12,
    background: theme.colors.muted,
    padding: '1px 6px',
    borderRadius: 4,
    fontFamily: 'monospace',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  card: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
    border: `1px solid ${theme.colors.borderSubtle}`,
  },
  cardTitle: { fontSize: 14, fontWeight: 700, marginBottom: 8 },
  ol: { margin: 0, paddingRight: 18, display: 'flex', flexDirection: 'column', gap: 8 },
  li: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  stepCode: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: theme.colors.textMuted,
    wordBreak: 'break-word',
  },
}
