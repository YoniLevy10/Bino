'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonProjectPicker } from '@/app/components/addons/AddonProjectPicker'
import { ProjectDocumentsPanel } from '@/app/components/projects/ProjectDocumentsPanel'
import { PaidAddonGate } from '@/app/components/PaidAddonGate'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
} from '../components/ui'

export default function ProjectDocumentsPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <AppShell isMobile={isMobile}>
      <PaidAddonGate addonKey={PAID_ADDON_KEYS.project_documents}>
        {isMobile && (
          <MobileHeader
            title="תיקיית מסמכים"
            subtitle="ארכיון קבצים לפי בניין"
            onMenuClick={() => setMenuOpen(true)}
          />
        )}
        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

        <div
          style={{
            ...styles.content,
            ...(isMobile ? styles.contentMobile : {}),
          }}
        >
          {!isMobile && (
            <PageHeader
              title="תיקיית מסמכים"
              subtitle="העלאה, הורדה וארכיון מסמכים לפי פרויקט"
            />
          )}

          <AddonProjectPicker emptyHint="הוסיפו בניין בדף פרויקטים כדי לנהל מסמכים.">
            {(project) => <ProjectDocumentsPanel projectId={project.id} />}
          </AddonProjectPicker>
        </div>
      </PaidAddonGate>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    maxWidth: 720,
    margin: '0 auto',
  },
  contentMobile: {
    padding: '16px 16px 32px',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
}
