'use client'

import { useEffect, type CSSProperties } from 'react'
import Link from 'next/link'
import { theme } from '@/app/components/ui'

/** Office QR clock is deprecated — field workers use NFC stickers only. */
export default function AttendanceScanDeprecatedPage() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      window.location.href = '/attendance'
    }, 8000)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div dir="rtl" style={shell}>
      <div style={box}>
        <div style={icon}>📱</div>
        <h1 style={title}>עברנו למדבקות NFC</h1>
        <p style={msg}>
          שעון המשרד ב-QR הוצא משימוש. עובדי שטח מחתימים שעות בהצמדת הטלפון למדבקה בדלת.
        </p>
        <p style={sub}>מעבירים אתכם לדף חתמת עובדים...</p>
        <Link href="/attendance" style={link}>
          לחתמת עובדים עכשיו
        </Link>
      </div>
    </div>
  )
}

const shell: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: theme.colors.background,
  padding: 24,
}

const box: CSSProperties = {
  maxWidth: 420,
  textAlign: 'center',
  padding: 32,
  borderRadius: 16,
  background: theme.colors.surface,
  border: `1px solid ${theme.colors.border}`,
}

const icon: CSSProperties = { fontSize: 48, marginBottom: 12 }

const title: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 22,
  fontWeight: 700,
  color: theme.colors.textPrimary,
}

const msg: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 16,
  lineHeight: 1.55,
  color: theme.colors.textPrimary,
}

const sub: CSSProperties = {
  margin: '0 0 20px',
  fontSize: 14,
  color: theme.colors.textMuted,
}

const link: CSSProperties = {
  display: 'inline-block',
  padding: '12px 24px',
  borderRadius: 10,
  background: theme.colors.primary,
  color: '#fff',
  fontWeight: 600,
  textDecoration: 'none',
}
