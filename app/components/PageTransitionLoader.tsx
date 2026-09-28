'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { isWorkerPortalPath } from '@/lib/is-worker-portal-path'
import { tryReadWorkerPortalBranding } from '@/lib/worker-branding'
import { useClientBranding, tryReadBrandingFromSessionCache } from './ClientBrandingContext'

const DEFAULT_LOGO = '/apple-icon.png'

const logoStyle = {
  width: 72,
  height: 72,
  objectFit: 'contain' as const,
  borderRadius: 14,
  boxShadow: '0 6px 24px rgba(26, 26, 46, 0.08)',
}

export function PageTransitionLoader({
  compact = false,
  logoUrl: logoUrlOverride,
}: {
  compact?: boolean
  /** Explicit logo (e.g. worker bootstrap) — wins over cache/context. */
  logoUrl?: string | null
}) {
  const pathname = usePathname()
  const isWorker = isWorkerPortalPath(pathname)
  const { logoUrl: ctxLogoUrl, isBootstrapped } = useClientBranding()
  const [managerCached] = useState(() => (isWorker ? null : tryReadBrandingFromSessionCache()))

  // Live-read worker cache so logo appears as soon as bootstrap writes it.
  const workerCached = isWorker ? tryReadWorkerPortalBranding() : null

  const src =
    (logoUrlOverride && logoUrlOverride.trim()) ||
    (isWorker ? workerCached?.logoUrl : null) ||
    (!isWorker && isBootstrapped && (ctxLogoUrl || managerCached?.logoUrl)
      ? ctxLogoUrl || managerCached!.logoUrl!
      : null) ||
    DEFAULT_LOGO

  return (
    <div
      dir="rtl"
      className="bamakor-page-loader"
      style={{
        minHeight: compact ? 200 : '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 12 : 20,
        padding: compact ? 16 : 24,
        background: isWorker ? 'transparent' : 'var(--color-background, #F9F9FB)',
      }}
      aria-busy="true"
      aria-label="טוען"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={72} height={72} style={logoStyle} className="bamakor-page-loader-logo" />
      <div
        className="bamakor-page-loader-track"
        style={{
          width: 192,
          height: 3,
          borderRadius: 999,
          background: 'var(--color-border, #E8E8ED)',
          overflow: 'hidden',
        }}
        aria-hidden
      >
        <div className="bamakor-page-loader-bar" />
      </div>
    </div>
  )
}
