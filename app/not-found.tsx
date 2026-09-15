'use client'

import Image from 'next/image'
import Link from 'next/link'
import { theme } from './components/ui'

export default function NotFound() {
  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Logo */}
        <div style={styles.logoContainer}>
          <Image
            src="/apple-icon.png"
            alt="Bino"
            width={64}
            height={64}
            style={{ borderRadius: theme.radius.lg }}
          />
        </div>

        {/* 404 Text */}
        <h1 style={styles.errorCode}>404</h1>
        <p style={styles.errorMessage}>Page Not Found</p>
        <p style={styles.description}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Back Button */}
        <Link href="/dashboard" style={styles.backButton}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.colors.background,
    padding: '24px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    maxWidth: '400px',
  },
  logoContainer: {
    marginBottom: '32px',
  },
  errorCode: {
    fontSize: '120px',
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    margin: 0,
    lineHeight: 1,
    letterSpacing: '-0.03em',
  },
  errorMessage: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    margin: 0,
    marginTop: '16px',
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textMuted,
    margin: 0,
    marginTop: '12px',
    lineHeight: 1.5,
  },
  backButton: {
    marginTop: '32px',
    padding: '14px 28px',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textInverse,
    background: theme.colors.primary,
    borderRadius: theme.radius.md,
    textDecoration: 'none',
    transition: 'background 0.15s, transform 0.1s',
  },
}
