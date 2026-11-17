'use client'

/**
 * Reusable share-to-building-WhatsApp-group control.
 * Empty state when no chat.whatsapp.com invite is configured on the project.
 * Manual share only — opens WhatsApp picker / invite; no Meta blast.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { Button, theme } from '@/app/components/ui'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import {
  normalizeWhatsAppGroupInviteUrl,
  openWhatsAppGroupInvite,
  openWhatsAppShareMessage,
} from '@/lib/whatsapp-building-share'

type Props = {
  projectId: string
  /** Current invite URL from projects.whatsapp_group_invite_url */
  groupInviteUrl: string | null | undefined
  /** Prefill message for WhatsApp share picker */
  shareMessage: string
  /** Called after a successful save so parents can refresh local state */
  onGroupInviteSaved?: (url: string | null) => void
  size?: 'sm' | 'md'
  fullWidth?: boolean
  /** Primary button label when configured */
  shareLabel?: string
}

export function WhatsAppBuildingShareButton({
  projectId,
  groupInviteUrl,
  shareMessage,
  onGroupInviteSaved,
  size = 'sm',
  fullWidth = false,
  shareLabel = 'שיתוף לקבוצת וואטסאפ',
}: Props) {
  const [draft, setDraft] = useState(groupInviteUrl || '')
  const [saving, setSaving] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  const normalized = normalizeWhatsAppGroupInviteUrl(groupInviteUrl)
  const configured = Boolean(normalized)

  useEffect(() => {
    setDraft(groupInviteUrl || '')
    if (normalizeWhatsAppGroupInviteUrl(groupInviteUrl)) {
      setShowConfig(false)
    }
  }, [groupInviteUrl, projectId])

  async function saveInvite(raw: string) {
    const next = normalizeWhatsAppGroupInviteUrl(raw)
    if (raw.trim() && !next) {
      toast.error('נדרש קישור הזמנה לקבוצה (chat.whatsapp.com/…)')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithTimeout('/api/update-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          whatsapp_group_invite_url: next,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success(next ? 'קישור קבוצת הוואטסאפ נשמר' : 'קישור הקבוצה הוסר')
      onGroupInviteSaved?.(next)
      setShowConfig(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  function onShare() {
    if (!shareMessage.trim()) {
      toast.error('אין הודעה לשיתוף')
      return
    }
    const ok = openWhatsAppShareMessage(shareMessage)
    if (!ok) toast.error('פתיחת וואטסאפ נכשלה')
  }

  function onOpenGroup() {
    if (!normalized) return
    const ok = openWhatsAppGroupInvite(normalized)
    if (!ok) toast.error('פתיחת הקבוצה נכשלה')
  }

  if (!configured || showConfig) {
    return (
      <div style={styles.emptyBox} role="status">
        <p style={styles.emptyTitle}>אין קבוצת וואטסאפ לבניין</p>
        <p style={styles.emptyHint}>
          הדביקו קישור הזמנה לקבוצה (chat.whatsapp.com) ואז תוכלו לשתף הודעות לקבוצה.
        </p>
        <input
          type="url"
          dir="ltr"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://chat.whatsapp.com/…"
          style={styles.input}
          aria-label="קישור הזמנה לקבוצת וואטסאפ"
        />
        <div style={{ ...styles.row, ...(fullWidth ? styles.rowStack : null) }}>
          <Button
            type="button"
            variant="primary"
            size={size}
            disabled={saving}
            onClick={() => void saveInvite(draft)}
            style={fullWidth ? styles.full : undefined}
          >
            {saving ? 'שומר…' : 'שמירת קישור קבוצה'}
          </Button>
          {configured ? (
            <Button
              type="button"
              variant="ghost"
              size={size}
              disabled={saving}
              onClick={() => setShowConfig(false)}
              style={fullWidth ? styles.full : undefined}
            >
              ביטול
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...styles.row, ...(fullWidth ? styles.rowStack : null) }}>
      <Button
        type="button"
        variant="secondary"
        size={size}
        onClick={onShare}
        style={fullWidth ? styles.full : undefined}
      >
        {shareLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        onClick={onOpenGroup}
        style={fullWidth ? styles.full : undefined}
      >
        פתח קבוצה
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        onClick={() => setShowConfig(true)}
        style={fullWidth ? styles.full : undefined}
      >
        החלפת קישור
      </Button>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  emptyBox: {
    display: 'grid',
    gap: 8,
    padding: 12,
    borderRadius: theme.radius.md,
    border: `1px dashed ${theme.colors.border}`,
    background: theme.colors.muted,
  },
  emptyTitle: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  emptyHint: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.45,
    color: theme.colors.textSecondary,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  rowStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  full: {
    width: '100%',
  },
}
