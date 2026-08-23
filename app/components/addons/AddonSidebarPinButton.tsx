'use client'

import { useState, type CSSProperties, type MouseEvent } from 'react'
import { toast, asyncHandler } from '@/lib/error-handler'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { enabledAddonKeysFromEntitlements } from '@/lib/addons-nav'
import { navIdsForEnabledAddonKeys, PAID_ADDON_NAV_ID } from '@/lib/paid-addons'
import type { PaidAddonDisplayEntry } from '@/lib/paid-addons-catalog'
import { nextSidebarOrderAfterPinToggle } from '@/lib/sidebar-nav'
import { theme } from '../ui'
import { usePaidAddons } from '../PaidAddonsContext'
import { useSidebarNav } from '../SidebarNavContext'

export function AddonSidebarPinButton({
  entry,
  compact = false,
}: {
  entry: PaidAddonDisplayEntry
  compact?: boolean
}) {
  const { addons } = usePaidAddons()
  const { navItems, orderIds, enabledFeatures, setLocalOrderIds, refreshNav } = useSidebarNav()
  const [saving, setSaving] = useState(false)

  if (entry.locked) return null

  const navId = PAID_ADDON_NAV_ID[entry.id]
  const pinned = navItems.some((item) => item.id === navId)

  async function onToggle(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (saving) return

    const enabledKeys = enabledAddonKeysFromEntitlements(addons)
    const paidNavIds = new Set(navIdsForEnabledAddonKeys(enabledKeys))
    const nextPinned = !pinned
    const nextOrder = nextSidebarOrderAfterPinToggle(
      orderIds,
      enabledFeatures,
      paidNavIds,
      navId,
      nextPinned
    )

    setSaving(true)
    setLocalOrderIds(nextOrder)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout(
          '/api/client/sidebar-pin',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addon_key: entry.id, pinned: nextPinned }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(json.error || 'עדכון התפריט נכשל')
        toast.success(nextPinned ? 'נוסף לתפריט הצד' : 'הוסר מתפריט הצד')
        await refreshNav()
        return true
      },
      { context: 'עדכון תפריט הצד נכשל', showErrorToast: true }
    )
    setSaving(false)
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseDown={(e) => e.stopPropagation()}
      disabled={saving}
      aria-pressed={pinned}
      aria-label={pinned ? `הסר את ${entry.title} מתפריט הצד` : `הוסף את ${entry.title} לתפריט הצד`}
      style={{
        ...styles.btn,
        ...(pinned ? styles.btnPinned : {}),
        ...(compact ? styles.btnCompact : {}),
      }}
    >
      {pinned ? 'בתפריט הצד' : 'הוסף לתפריט צד'}
    </button>
  )
}

const styles: Record<string, CSSProperties> = {
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    borderRadius: theme.radius.md,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  btnCompact: {
    padding: '4px 8px',
    fontSize: 11,
  },
  btnPinned: {
    background: theme.colors.primaryMuted,
    borderColor: theme.colors.primary,
    color: theme.colors.primary,
  },
}
