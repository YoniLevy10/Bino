'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  buildResidentIntakeShareMessage,
  buildResidentIntakeUrl,
  buildResidentIntakeWhatsAppShareUrl,
} from '@/lib/resident-intake'
import { getClientPublicOrigin, getResidentPortalJoinUrl } from '@/lib/public-origin'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { usePaidAddons } from '../PaidAddonsContext'
import { Button, theme } from '../ui'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

type ShareKind = 'resident_join' | 'resident_intake'

type Props = {
  projectId: string
  projectName: string
  projectCode: string
  clientId: string
  isActive: boolean
  onToggleActive: () => void
  onDelete: () => void
}

type MenuRow = {
  id: string
  label: string
  onClick: () => void
}

/**
 * Compact action buttons for a building detail drawer:
 * share shortcuts (intermediate copy / WhatsApp) + links to addon pages + danger actions.
 */
export function ProjectAdvancedActions({
  projectId,
  projectName,
  projectCode,
  clientId,
  isActive,
  onToggleActive,
  onDelete,
}: Props) {
  const router = useRouter()
  const { isBootstrapped, hasAddon } = usePaidAddons()
  const [view, setView] = useState<'menu' | ShareKind>('menu')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setView('menu')
    setCopied(false)
    setBusy(false)
  }, [projectId])

  const joinUrl = useMemo(() => getResidentPortalJoinUrl(projectId), [projectId])
  const intakeUrl = useMemo(
    () =>
      buildResidentIntakeUrl({
        projectCode,
        clientId,
        baseUrl: getClientPublicOrigin(),
      }),
    [projectCode, clientId]
  )
  const intakeShareMessage = useMemo(
    () =>
      buildResidentIntakeShareMessage({
        projectName,
        intakeUrl,
      }),
    [projectName, intakeUrl]
  )

  const menuRows = useMemo(() => {
    const rows: MenuRow[] = [
      {
        id: 'resident_join',
        label: 'קישור אזור אישי לדיירים',
        onClick: () => setView('resident_join'),
      },
      {
        id: 'resident_intake',
        label: 'סקר רישום דיירים',
        onClick: () => setView('resident_intake'),
      },
    ]
    if (isBootstrapped && hasAddon(PAID_ADDON_KEYS.project_documents)) {
      rows.push({
        id: 'project_documents',
        label: 'מסמכי הבניין',
        onClick: () => {
          router.push(`/project-documents?project=${encodeURIComponent(projectId)}`)
        },
      })
    }
    return rows
  }, [hasAddon, isBootstrapped, projectId, router])

  async function ensureResidentPortalEnabled(): Promise<boolean> {
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
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הפעלת הקישור נכשלה')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(successMessage)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('ההעתקה נכשלה')
    }
  }

  async function onCopy() {
    if (view === 'resident_join') {
      const ok = await ensureResidentPortalEnabled()
      if (!ok) return
      await copyText(joinUrl, 'הקישור הועתק')
      return
    }
    if (view === 'resident_intake') {
      await copyText(intakeUrl, 'קישור הסקר הועתק')
    }
  }

  async function onWhatsApp() {
    if (view === 'resident_join') {
      const ok = await ensureResidentPortalEnabled()
      if (!ok) return
      const building = projectName.trim() || 'הבניין'
      const text = `שלום, קישור לאזור האישי של הדיירים ב-${building}:\n${joinUrl}\n\nנכנסים עם מספר הטלפון הרשום — נשלחת סיסמה חד־פעמית (מספרים) ב-SMS.`
      window.open(
        `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`,
        '_blank',
        'noopener,noreferrer'
      )
      return
    }
    if (view === 'resident_intake') {
      window.open(
        buildResidentIntakeWhatsAppShareUrl(intakeShareMessage),
        '_blank',
        'noopener,noreferrer'
      )
    }
  }

  if (view !== 'menu') {
    const title = view === 'resident_join' ? 'קישור אזור אישי לדיירים' : 'סקר רישום דיירים'
    return (
      <div style={styles.wrap}>
        <button type="button" style={styles.backBtn} onClick={() => setView('menu')}>
          → חזרה
        </button>
        <h4 style={styles.shareTitle}>{title}</h4>
        <div style={styles.shareActions}>
          <Button variant="primary" onClick={() => void onCopy()} disabled={busy} style={{ width: '100%' }}>
            {copied ? 'הועתק' : 'העתק קישור'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void onWhatsApp()}
            disabled={busy}
            style={{ width: '100%' }}
          >
            שלח בוואטסאפ
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.menu}>
        {menuRows.map((row) => (
          <button key={row.id} type="button" style={styles.menuBtn} onClick={row.onClick}>
            <span>{row.label}</span>
            <span style={styles.chevron} aria-hidden>
              ←
            </span>
          </button>
        ))}
      </div>

      <div style={styles.divider} />

      <Button variant="secondary" onClick={onToggleActive} style={{ width: '100%' }}>
        {isActive ? 'השבתת בניין' : 'הפעלת בניין'}
      </Button>

      <div style={styles.dangerZone}>
        <Button variant="danger" onClick={onDelete} style={{ width: '100%' }}>
          מחיקת בניין
        </Button>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'grid',
    gap: 10,
  },
  menu: {
    display: 'grid',
    gap: 8,
  },
  menuBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
    minHeight: 48,
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'right',
  },
  chevron: {
    color: theme.colors.textMuted,
    fontSize: 16,
    lineHeight: 1,
  },
  divider: {
    height: 1,
    background: theme.colors.border,
    margin: '4px 0',
  },
  dangerZone: {
    paddingTop: 4,
  },
  backBtn: {
    alignSelf: 'start',
    border: 'none',
    background: 'transparent',
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    padding: '4px 0',
    textAlign: 'right',
  },
  shareTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  shareActions: {
    display: 'grid',
    gap: 8,
  },
}
