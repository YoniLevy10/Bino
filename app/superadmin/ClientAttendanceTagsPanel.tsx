'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { theme } from '../components/ui'
import { LoadingButton } from '../components/LoadingButton'
import { toast } from '@/lib/error-handler'

type TagRow = {
  id: string
  tag_code: string
  tag_type: string
  label: string | null
  is_active: boolean
  sticker_installed_at?: string | null
  scan_url?: string
}

type Project = { id: string; name: string; project_code: string }

export function ClientAttendanceTagsPanel({
  clientId,
  secret,
  projects,
}: {
  clientId: string
  secret: string
  projects: Project[]
}) {
  const [stampAddonEnabled, setStampAddonEnabled] = useState(false)
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [wizardIndex, setWizardIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const [togglingInstall, setTogglingInstall] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const installedCount = useMemo(
    () => tags.filter((t) => t.sticker_installed_at).length,
    [tags]
  )

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => {
      if (a.tag_type === 'office' && b.tag_type !== 'office') return -1
      if (b.tag_type === 'office' && a.tag_type !== 'office') return 1
      return (a.label || a.tag_code).localeCompare(b.label || b.tag_code, 'he')
    })
  }, [tags])

  const currentTag = sortedTags[wizardIndex] ?? null

  const loadAddons = useCallback(async () => {
    const res = await fetch(`/api/superadmin/client/${clientId}/addons`, {
      headers: { 'x-admin-secret': secret },
    })
    const body = (await res.json().catch(() => ({}))) as {
      addons?: { addon_key: string; enabled: boolean }[]
    }
    if (res.ok) {
      const on = (body.addons ?? []).some((a) => a.addon_key === 'worker_stamp' && a.enabled)
      setStampAddonEnabled(on)
      return on
    }
    return false
  }, [clientId, secret])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/attendance-tags`, {
        headers: { 'x-admin-secret': secret },
      })
      const body = (await res.json().catch(() => ({}))) as { tags?: TagRow[] }
      if (res.ok) setTags(body.tags ?? [])
    } finally {
      setLoading(false)
    }
  }, [clientId, secret])

  useEffect(() => {
    void (async () => {
      const on = await loadAddons()
      if (on) void load()
    })()
  }, [loadAddons, load])

  async function bulkCreateTags() {
    setBulkSaving(true)
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/attendance-tags/bulk`, {
        method: 'POST',
        headers: { 'x-admin-secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_office: true, office_tag_code: 'OFFICE' }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        toast.error(typeof body.error === 'string' ? body.error : 'יצירה נכשלה')
        return
      }
      toast.success(body.message || 'התגים נוצרו')
      setWizardIndex(0)
      await load()
    } finally {
      setBulkSaving(false)
    }
  }

  async function copyCurrentUrl() {
    if (!currentTag?.scan_url) return
    try {
      await navigator.clipboard.writeText(currentTag.scan_url)
      setCopied(true)
      toast.success('הקישור הועתק — הדביקו באפליקציית NFC')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('העתקה נכשלה')
    }
  }

  async function toggleStickerInstalled(installed: boolean) {
    if (!currentTag) return
    setTogglingInstall(true)
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/attendance-tags/installed`, {
        method: 'PATCH',
        headers: { 'x-admin-secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: currentTag.id, installed }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(typeof body.error === 'string' ? body.error : 'עדכון נכשל')
        return
      }
      toast.success(installed ? 'סומן כהודבק' : 'סומן כלא הודבק')
      await load()
    } finally {
      setTogglingInstall(false)
    }
  }

  async function toggleTagActive(isActive: boolean) {
    if (!currentTag) return
    if (
      !isActive &&
      !window.confirm(
        'להשבית את התג? המדבקה בשטח תפסיק להחתים עד שתפעילו שוב. היסטוריית משמרות נשמרת.'
      )
    ) {
      return
    }
    setTogglingActive(true)
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/attendance-tags/status`, {
        method: 'PATCH',
        headers: { 'x-admin-secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: currentTag.id, is_active: isActive }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(typeof body.error === 'string' ? body.error : 'עדכון נכשל')
        return
      }
      toast.success(isActive ? 'התג הופעל מחדש' : 'התג הושבת — המדבקה לא תחתים')
      await load()
    } finally {
      setTogglingActive(false)
    }
  }

  async function deleteCurrentTag() {
    if (!currentTag) return
    const label = currentTag.label || currentTag.tag_code
    if (
      !window.confirm(
        `למחוק את התג «${label}» מהמערכת?\nהמדבקה הפיזית עם הקוד ${currentTag.tag_code} תפסיק לעבוד לצמיתות. היסטוריה נשמרת.`
      )
    ) {
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/attendance-tags/delete`, {
        method: 'POST',
        headers: { 'x-admin-secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: currentTag.id }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(typeof body.error === 'string' ? body.error : 'מחיקה נכשלה')
        return
      }
      toast.success('התג נמחק')
      setWizardIndex((i) => Math.max(0, i - 1))
      await load()
    } finally {
      setDeleting(false)
    }
  }

  if (!stampAddonEnabled) {
    return (
      <div style={boxStyle}>
        <div style={titleStyle}>מדבקות NFC — חתמת עובדים</div>
        <p style={hintStyle}>הפעילו קודם את התוסף «חתמת עובדים» ללקוח.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={boxStyle}>
        <p style={hintStyle}>טוען מדבקות...</p>
      </div>
    )
  }

  if (tags.length === 0) {
    return (
      <div style={boxStyle}>
        <div style={titleStyle}>שלב 1 — יצירת רשימת מדבקות</div>
        <p style={hintStyle}>
          לוחצים פעם אחת — נוצרת מדבקה למשרד + מדבקה לכל {projects.length} בניינים.
        </p>
        <LoadingButton onClick={() => void bulkCreateTags()} loading={bulkSaving} loadingText="יוצר...">
          צור את כל המדבקות
        </LoadingButton>
      </div>
    )
  }

  return (
    <div style={boxStyle}>
      <div style={titleStyle}>
        תכנון מדבקות NFC — {wizardIndex + 1} מתוך {sortedTags.length}
        <span style={{ fontWeight: 400, fontSize: 13, color: theme.colors.textMuted, marginRight: 8 }}>
          ({installedCount}/{sortedTags.length} הודבקו)
        </span>
      </div>

      <div style={progressBarWrap}>
        <div
          style={{
            ...progressBarFill,
            width: `${sortedTags.length ? Math.round((installedCount / sortedTags.length) * 100) : 0}%`,
          }}
        />
      </div>

      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <a
          href={`/api/superadmin/client/${clientId}/attendance-tags/print-sheet`}
          target="_blank"
          rel="noopener noreferrer"
          style={printLinkStyle}
          onClick={(e) => {
            e.preventDefault()
            void fetch(`/api/superadmin/client/${clientId}/attendance-tags/print-sheet`, {
              headers: { 'x-admin-secret': secret },
            })
              .then((r) => r.text())
              .then((html) => {
                const w = window.open('', '_blank')
                if (w) {
                  w.document.write(html)
                  w.document.close()
                }
              })
              .catch(() => toast.error('פתיחת גיליון הדפסה נכשלה'))
          }}
        >
          גיליון הדפסת מדבקות (PDF)
        </a>
      </div>

      {currentTag ? (
        <div style={wizardCard}>
          <div style={wizardLocation}>
            {currentTag.tag_type === 'office' ? '🏢 משרד' : '🏗️ בניין'}
          </div>
          <div style={wizardName}>{currentTag.label || currentTag.tag_code}</div>
          <div style={wizardCode}>
            קוד: {currentTag.tag_code}
            {!currentTag.is_active ? (
              <span style={{ color: theme.colors.error, marginRight: 8 }}>· מושבת</span>
            ) : null}
          </div>

          {currentTag.scan_url ? (
            <div style={qrCenter}>
              <QRCodeCanvas value={currentTag.scan_url} size={140} includeMargin />
            </div>
          ) : null}

          <button type="button" style={bigCopyBtn} onClick={() => void copyCurrentUrl()}>
            {copied ? '✓ הועתק!' : 'העתק קישור למדבקה'}
          </button>

          <LoadingButton
            onClick={() => void toggleStickerInstalled(!currentTag.sticker_installed_at)}
            loading={togglingInstall}
            loadingText="שומר..."
          >
            {currentTag.sticker_installed_at ? '✓ הודבק — לחץ לביטול' : 'סמן: המדבקה הודבקה על הדלת'}
          </LoadingButton>

          <div style={dangerRow}>
            <LoadingButton
              onClick={() => void toggleTagActive(!currentTag.is_active)}
              loading={togglingActive}
              loadingText="מעדכן..."
            >
              {currentTag.is_active ? 'השבת תג (מדבקה מפסיקה להחתים)' : 'הפעל תג מחדש'}
            </LoadingButton>
            <LoadingButton
              onClick={() => void deleteCurrentTag()}
              loading={deleting}
              loadingText="מוחק..."
            >
              מחק תג מהמערכת
            </LoadingButton>
          </div>
          <p style={dangerHint}>
            מדבקות שכבר בשטח — אל תמחקו/תשביתו אלא אם רוצים שהן יפסיקו לעבוד. השבתה הפיכה; מחיקה לא.
          </p>

          <div style={stepsBox}>
            <div style={stepsTitle}>עכשיו בטלפון:</div>
            <ol style={stepsList}>
              <li>פתחו <strong>NFC Tools</strong> (אנדרואיד) או <strong>TagWriter</strong> (אייפון)</li>
              <li>בחרו «כתיבת קישור» / Write URL</li>
              <li>הדביקו את הקישור שהעתקתם</li>
              <li>הצמידו את הטלפון למדבקה הריקה → Write</li>
              <li>הדביקו את המדבקה על הדלת</li>
            </ol>
          </div>

          <div style={navRow}>
            <button
              type="button"
              style={navBtn}
              disabled={wizardIndex === 0}
              onClick={() => setWizardIndex((i) => Math.max(0, i - 1))}
            >
              ← הקודם
            </button>
            <select
              style={jumpSelect}
              value={String(wizardIndex)}
              onChange={(e) => setWizardIndex(Number(e.target.value))}
            >
              {sortedTags.map((t, i) => (
                <option key={t.id} value={String(i)}>
                  {t.tag_type === 'office' ? 'משרד' : t.label || t.tag_code}
                  {!t.is_active ? ' (מושבת)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={navBtnPrimary}
              onClick={() =>
                setWizardIndex((i) => (i >= sortedTags.length - 1 ? 0 : i + 1))
              }
            >
              {wizardIndex >= sortedTags.length - 1 ? 'סיום ✓' : 'הבא →'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const boxStyle: CSSProperties = {
  marginBottom: theme.spacing.xl,
  padding: theme.spacing.lg,
  background: theme.colors.surface,
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
}

const titleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
  marginBottom: theme.spacing.sm,
}

const hintStyle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 13,
  color: theme.colors.textMuted,
  lineHeight: 1.5,
}

const progressBarWrap: CSSProperties = {
  height: 6,
  background: theme.colors.border,
  borderRadius: 999,
  marginBottom: 16,
  overflow: 'hidden',
}

const progressBarFill: CSSProperties = {
  height: '100%',
  background: theme.colors.primary,
  borderRadius: 999,
  transition: 'width 0.2s',
}

const wizardCard: CSSProperties = {
  padding: 16,
  borderRadius: theme.radius.md,
  background: theme.colors.background,
  border: `1px solid ${theme.colors.border}`,
  textAlign: 'center',
}

const wizardLocation: CSSProperties = {
  fontSize: 28,
  marginBottom: 6,
}

const wizardName: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 4,
}

const wizardCode: CSSProperties = {
  fontSize: 12,
  color: theme.colors.textMuted,
  marginBottom: 14,
}

const qrCenter: CSSProperties = {
  display: 'inline-block',
  padding: 10,
  background: '#fff',
  borderRadius: 10,
  marginBottom: 14,
}

const bigCopyBtn: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: 320,
  margin: '0 auto 16px',
  padding: '14px 20px',
  fontSize: 16,
  fontWeight: 700,
  border: 'none',
  borderRadius: 10,
  background: theme.colors.primary,
  color: '#fff',
  cursor: 'pointer',
}

const stepsBox: CSSProperties = {
  textAlign: 'right',
  background: theme.colors.primaryMuted,
  borderRadius: theme.radius.sm,
  padding: 14,
  marginBottom: 16,
}

const stepsTitle: CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  marginBottom: 8,
}

const stepsList: CSSProperties = {
  margin: 0,
  paddingRight: 20,
  fontSize: 13,
  lineHeight: 1.65,
}

const navRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: 'center',
  alignItems: 'center',
}

const navBtn: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  cursor: 'pointer',
  fontSize: 13,
}

const navBtnPrimary: CSSProperties = {
  ...navBtn,
  background: theme.colors.primary,
  color: '#fff',
  border: 'none',
  fontWeight: 600,
}

const jumpSelect: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${theme.colors.border}`,
  fontSize: 13,
  minWidth: 160,
}

const printLinkStyle: CSSProperties = {
  fontSize: 13,
  color: theme.colors.primary,
  fontWeight: 600,
  textDecoration: 'underline',
  cursor: 'pointer',
}

const dangerRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: 'center',
  marginTop: 12,
  marginBottom: 8,
}

const dangerHint: CSSProperties = {
  margin: '0 0 16px',
  fontSize: 12,
  color: theme.colors.textMuted,
  lineHeight: 1.45,
}
