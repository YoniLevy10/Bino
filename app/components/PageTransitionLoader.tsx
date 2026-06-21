'use client'

import { useState } from 'react'
import { useClientBranding, tryReadBrandingFromSessionCache } from './ClientBrandingContext'

const DEFAULT_LOGO = '/apple-icon.png'

const logoStyle = {
  width: 72,
  height: 72,
  objectFit: 'contain' as const,
  borderRadius: 14,
  boxShadow: '0 6px 24px rgba(26, 26, 46, 0.08)',
}

export function PageTransitionLoader() {
  const { logoUrl: ctxLogoUrl } = useClientBranding()
  const [cachedBranding] = useState(() => tryReadBrandingFromSessionCache())
  const src = ctxLogoUrl || cachedBranding?.logoUrl || DEFAULT_LOGO

  return (
    <div
      dir="rtl"
      className="bamakor-page-loader"
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 24,
        background: 'var(--color-background, #F9F9FB)',
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
