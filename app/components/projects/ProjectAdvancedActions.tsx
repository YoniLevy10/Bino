'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  buildResidentIntakeShareMessage,
  buildResidentIntakeUrl,
  buildResidentIntakeWhatsAppShareUrl,
} from '@/lib/residents/resident-intake'
import { getClientPublicOrigin, getResidentPortalJoinUrl } from '@/lib/shared/public-origin'
import { PAID_ADDON_KEYS } from '@/lib/addons/paid-addons'
import { usePaidAddons } from '../PaidAddonsContext'
import { Button, theme } from '../ui'
import { toast, errorMessageFromResponseJson } from '@/lib/errors/error-handler'
import { fetchWithTimeout } from '@/lib/shared/fetch-with-timeout'

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
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  useEffect(() => {
    setView('menu')
    setCopied(false)
    setBusy(false)
    setHoveredRow(null)
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
        label: 'מסמכים',
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
      <p style={styles.sectionLabel}>פעולות נוספות</p>
      <div style={styles.menu}>
        {menuRows.map((row) => (
          <button
            key={row.id}
            type="button"
            style={{
              ...styles.menuBtn,
              ...(hoveredRow === row.id ? styles.menuBtnHover : null),
            }}
            onClick={row.onClick}
            onMouseEnter={() => setHoveredRow(row.id)}
            onMouseLeave={() => setHoveredRow(null)}
          >
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
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
  },
  sectionLabel: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textMuted,
  },
  menu: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  menuBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    width: '100%',
    minHeight: 48,
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'right',
    boxShadow: theme.shadows.xs,
    transition: `background ${theme.motion.fast} ease, border-color ${theme.motion.fast} ease`,
  },
  menuBtnHover: {
    background: theme.colors.surfaceHover,
    borderColor: theme.colors.borderStrong,
  },
  chevron: {
    color: theme.colors.textMuted,
    fontSize: 16,
    lineHeight: 1,
  },
  divider: {
    height: 1,
    background: theme.colors.borderSubtle,
    margin: `${theme.spacing.xs} 0`,
  },
  dangerZone: {
    paddingTop: theme.spacing.xs,
  },
  backBtn: {
    alignSelf: 'start',
    border: 'none',
    background: 'transparent',
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    fontFamily: 'inherit',
    cursor: 'pointer',
    padding: `${theme.spacing.xs} 0`,
    textAlign: 'right',
  },
  shareTitle: {
    margin: 0,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  shareActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
}
