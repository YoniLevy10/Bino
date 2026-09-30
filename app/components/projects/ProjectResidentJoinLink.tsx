'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Button, Card, theme } from '../ui'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { getResidentPortalJoinUrl } from '@/lib/public-origin'

type Props = {
  projectId: string
  projectName?: string | null
}

/**
 * Minimal manager UI: shared building join link for the WhatsApp group.
 * Residents enter with phone + numeric SMS OTP (one-time password).
 */
export function ProjectResidentJoinLink({ projectId, projectName }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // Always bino.casa (NEXT_PUBLIC_APP_URL) — never window.location / *.vercel.app
  const joinUrl = useMemo(() => getResidentPortalJoinUrl(projectId), [projectId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout(
        `/api/projects/resident-portal/settings?project_id=${encodeURIComponent(projectId)}`
      )
      const json = (await res.json()) as {
        project?: { resident_portal_enabled?: boolean }
        error?: string
      }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      setEnabled(Boolean(json.project?.resident_portal_enabled))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת קישור נכשלה')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function ensureEnabled(): Promise<boolean> {
    if (enabled) return true
    setBusy(true)
    try {
      const res = await fetchWithTimeout('/api/projects/resident-portal/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          resident_portal_enabled: true,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      setEnabled(true)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הפעלת הקישור נכשלה')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    const ok = await ensureEnabled()
    if (!ok) return
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      toast.success('הקישור הועתק — שלחו בקבוצת הוואטסאפ של הוועד')
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('העתקה נכשלה — העתיקו ידנית מהשדה')
    }
  }

  async function shareWhatsApp() {
    const ok = await ensureEnabled()
    if (!ok) return
    const building = projectName?.trim() || 'הבניין'
    const text = `שלום, קישור לאזור האישי של הדיירים ב-${building}:\n${joinUrl}\n\nנכנסים עם מספר הטלפון הרשום — נשלחת סיסמה חד־פעמית (מספרים) ב-SMS.`
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <Card
      title="קישור לאזור אישי לדיירים"
      subtitle="קישור אחד לבניין — שולחים בקבוצת הוואטסאפ. כניסה בטלפון + סיסמה מספרית ב-SMS."
    >
      {loading ? (
        <p style={styles.muted}>טוען…</p>
      ) : (
        <div style={styles.stack}>
          <label style={styles.label}>קישור פתוח לבניין</label>
          <input
            readOnly
            value={joinUrl}
            onFocus={(e) => e.currentTarget.select()}
            style={styles.input}
            aria-label="קישור כניסה לדיירים"
          />
          <div style={styles.row}>
            <Button variant="primary" onClick={() => void copyLink()} disabled={busy} style={{ flex: 1 }}>
              {copied ? 'הועתק' : 'העתקת קישור'}
            </Button>
            <Button variant="secondary" onClick={() => void shareWhatsApp()} disabled={busy} style={{ flex: 1 }}>
              שליחה בוואטסאפ
            </Button>
          </div>
          <p style={styles.hint}>
            {enabled
              ? 'הקישור פעיל. דייר רשום מזין טלפון ומקבל סיסמה מספרית משתנה ב-SMS.'
              : 'בלחיצה על העתקה/שליחה הקישור יופעל אוטומטית לפרויקט זה.'}
          </p>
        </div>
      )}
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  stack: { display: 'grid', gap: 10 },
  label: { fontSize: 13, color: theme.colors.textMuted, fontWeight: 600 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 48,
    fontSize: 14,
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.muted,
    color: theme.colors.textPrimary,
    direction: 'ltr',
    textAlign: 'left',
  },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  hint: { margin: 0, fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.45 },
  muted: { margin: 0, color: theme.colors.textMuted, fontSize: 14 },
}
