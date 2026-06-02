'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { isNavFeatureEnabled } from '@/lib/client-nav-features'
import { getPaidAddonCatalogEntry, type PaidAddonId } from '@/lib/paid-addons-catalog'
import type { SidebarNavItemId } from '@/lib/sidebar-nav'
import { useSidebarNav } from '../SidebarNavContext'
import { theme } from '../ui'

type Props = {
  featureId: PaidAddonId
  children: ReactNode
}

export function PaidAddonFeatureGate({ featureId, children }: Props) {
  const { enabledFeatures, isBootstrapped } = useSidebarNav()
  const entry = getPaidAddonCatalogEntry(featureId)

  if (!isBootstrapped) return null

  if (isNavFeatureEnabled(enabledFeatures, featureId as SidebarNavItemId)) {
    return <>{children}</>
  }

  if (!entry) return null

  return (
    <div
      style={{
        marginTop: 20,
        padding: 16,
        borderRadius: theme.radius.lg,
        border: `1px dashed ${theme.colors.borderStrong}`,
        background: theme.colors.muted,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15, color: theme.colors.textPrimary }}>{entry.title}</strong>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: theme.colors.warning,
            background: theme.colors.warningMuted,
            padding: '2px 8px',
            borderRadius: theme.radius.full,
          }}
        >
          תוסף בתשלום
        </span>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: theme.colors.textSecondary, lineHeight: 1.5 }}>
        {entry.tagline}. {entry.description}
      </p>
      <Link
        href="/addons"
        style={{ fontSize: 13, fontWeight: 600, color: theme.colors.primary, textDecoration: 'none' }}
      >
        לפרטים וליצירת קשר להפעלה →
      </Link>
    </div>
  )
}
