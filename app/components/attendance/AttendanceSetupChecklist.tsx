'use client'

import { useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Card, Button, theme } from '../ui'

type Props = {
  tagCount: number
  stickerInstalled: number
  stickerTotal: number
}

export function AttendanceSetupChecklist({ tagCount, stickerInstalled, stickerTotal }: Props) {
  const [sending, setSending] = useState(false)

  const steps = [
    { done: tagCount > 0, label: 'תגים במערכת', hint: tagCount > 0 ? `${tagCount} תגים` : 'פנו לתמיכת במקור' },
    {
      done: stickerTotal > 0 && stickerInstalled >= stickerTotal,
      label: 'מדבקות הודבקו',
      hint: stickerTotal > 0 ? `${stickerInstalled}/${stickerTotal} הודבקו` : '—',
    },
    { done: false, label: 'שליחת קישור לעובדים', hint: 'לחצו למטה' },
    { done: false, label: 'בדיקה — הצמדת טלפון למדבקה', hint: 'עשו עם עובד אחד' },
  ]

  async function sendAllLinks() {
    setSending(true)
    try {
      const res = await fetchWithTimeout('/api/attendance/send-worker-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_all_active: true }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) throw new Error(body.error || 'שליחה נכשלה')
      toast.success(body.message || 'נשלח')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card style={{ marginBottom: 16, border: `1px solid ${theme.colors.primary}` }}>
      <h3 style={styles.title}>רשימת הפעלה</h3>
      <ol style={styles.list}>
        {steps.map((s, i) => (
          <li key={i} style={{ ...styles.item, opacity: s.done ? 0.7 : 1 }}>
            <span style={s.done ? styles.checkDone : styles.check}>{s.done ? '✓' : i + 1}</span>
            <span>
              <strong>{s.label}</strong>
              <span style={styles.hint}> — {s.hint}</span>
            </span>
          </li>
        ))}
      </ol>
      <div style={styles.actions}>
        <Button variant="primary" size="sm" loading={sending} onClick={() => void sendAllLinks()}>
          שלח קישור לכל העובדים (SMS)
        </Button>
        <Button variant="secondary" size="sm" onClick={() => window.open('/attendance/worker-guide', '_blank')}>
          הדפס הוראות לעובדים
        </Button>
      </div>
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  title: { margin: '0 0 12px', fontSize: 16, fontWeight: 600 },
  list: { margin: '0 0 14px', padding: 0, listStyle: 'none' },
  item: { display: 'flex', gap: 10, marginBottom: 10, fontSize: 14, alignItems: 'flex-start' },
  check: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: theme.colors.border,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  checkDone: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: theme.colors.success,
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    flexShrink: 0,
  },
  hint: { fontSize: 13, color: theme.colors.textMuted, fontWeight: 400 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
}
