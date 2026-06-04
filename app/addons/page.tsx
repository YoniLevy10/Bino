'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  Card,
  theme,
} from '../components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PaidAddonsGrid } from '../components/PaidAddonsGrid'
import { usePaidAddons } from '../components/PaidAddonsContext'

export default function AddonsPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { isBootstrapped, catalogMissing, addons } = usePaidAddons()

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="תוספים בתשלום"
          subtitle="פיצ'רים נוספים מעבר למנוי"
          onMenuClick={() => setMenuOpen(true)}
        />
      )}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div
        style={{
          ...styles.content,
          ...(isMobile ? { padding: '16px 16px 24px', maxWidth: '100%' } : {}),
        }}
      >
        {!isMobile && (
          <PageHeader
            title="תוספים בתשלום"
            subtitle="הרחבת המערכת — מחיר חודשי לכל תוסף, הפעלה על ידי במקור"
          />
        )}

        <Card style={{ marginBottom: 16 }}>
          <p style={styles.intro}>
            תוספים נרכשים בנפרד מהתוכנית הבסיסית. לאחר הפעלה בחשבון שלכם תופיע כפתור כניסה לכל פיצ'ר.
            לצפייה במנוי ובשימוש החודשי —{' '}
            <Link href="/billing" style={styles.link}>
              דף חיוב ושימוש
            </Link>
            .
          </p>
        </Card>

        <PaidAddonsGrid
          addons={addons}
          catalogMissing={catalogMissing}
          loading={!isBootstrapped}
        />
      </div>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  intro: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.55,
    color: theme.colors.textSecondary,
  },
  link: { color: theme.colors.primary, textDecoration: 'none', fontWeight: 500 },
}
