import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { getLegalSiteConfig, type LegalSiteConfig } from '@/lib/legal-site-config'

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  padding: '32px 24px 48px',
  maxWidth: '720px',
  margin: '0 auto',
  fontFamily: 'Heebo, var(--font-inter), system-ui, sans-serif',
  lineHeight: 1.65,
  textAlign: 'right',
  color: '#0f172a',
  background: '#fff',
}

const navStyle: CSSProperties = {
  marginBottom: 24,
  fontSize: 14,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
}

const linkStyle: CSSProperties = {
  color: '#1e40af',
  fontWeight: 600,
  textDecoration: 'underline',
}

/** Shared chrome for public legal / Grow-audit pages. */
export function LegalPublicShell({
  children,
  backHref = '/vaad-pay',
  backLabel = '← חזרה לעמוד השירות',
  merchant,
  serviceHref = '/vaad-pay',
  contactHref = '/contact',
}: {
  children: ReactNode
  backHref?: string
  backLabel?: string
  /** When set (per-tenant Grow page), footer/nav use this merchant — not platform LEGAL_*. */
  merchant?: LegalSiteConfig
  serviceHref?: string
  contactHref?: string
}) {
  const cfg = merchant ?? getLegalSiteConfig()
  return (
    <main dir="rtl" style={shellStyle}>
      <nav style={navStyle}>
        <Link href={backHref} prefetch={false} style={linkStyle}>
          {backLabel}
        </Link>
        <Link href={serviceHref} prefetch={false} style={linkStyle}>
          שירות תשלומים
        </Link>
        <Link href="/terms" prefetch={false} style={linkStyle}>
          תקנון
        </Link>
        <Link href="/privacy" prefetch={false} style={linkStyle}>
          פרטיות
        </Link>
        <Link href={contactHref} prefetch={false} style={linkStyle}>
          יצירת קשר
        </Link>
      </nav>
      {children}
      <footer
        style={{
          marginTop: 40,
          paddingTop: 16,
          borderTop: '1px solid #e2e8f0',
          fontSize: 13,
          color: '#64748b',
        }}
      >
        {cfg.businessName}
        {cfg.phoneDisplay ? ` · ${cfg.phoneDisplay}` : ''}
        {cfg.address ? ` · ${cfg.address}` : ''}
      </footer>
    </main>
  )
}

export const legalProseStyle: CSSProperties = {
  whiteSpace: 'pre-wrap' as const,
  fontSize: 15,
}
