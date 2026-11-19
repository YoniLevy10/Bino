'use client'

/**
 * Unified finance workspace — one shell for expenses / bank / reports.
 * Routes /finance, /finance/bank, /finance/reports all render this.
 */

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { AddonProjectPicker } from '@/app/components/addons/AddonProjectPicker'
import { BuildingFinancePanel } from '@/app/components/projects/BuildingFinancePanel'
import { BuildingBankPanel } from '@/app/components/projects/BuildingBankPanel'
import { BuildingReportsPanel } from '@/app/components/projects/BuildingReportsPanel'
import { FilterTabs } from '@/app/components/ui'

export type FinanceWorkspaceSection = 'expenses' | 'bank' | 'reports'

/** In-page tabs for כספים — bank has its own sidebar/Hub destination. */
const SECTIONS: { id: FinanceWorkspaceSection; label: string; href: string }[] = [
  { id: 'expenses', label: 'הוצאות ותקציב', href: '/finance' },
  { id: 'reports', label: 'דוחות', href: '/finance/reports' },
]

const META: Record<
  FinanceWorkspaceSection,
  { title: string; mobileSubtitle: string; desktopSubtitle: string }
> = {
  expenses: {
    title: 'כספים',
    mobileSubtitle: 'הוצאות · תקציב · בנק · דוחות',
    desktopSubtitle: 'הנהלת חשבונות בניין — הוצאות, חשבון בנק ודוחות במקום אחד',
  },
  bank: {
    title: 'כספים',
    mobileSubtitle: 'יתרות · תנועות · העברות · ספרים',
    desktopSubtitle: 'חשבון בנק חי — Financy AIS/PIS וספרים מחוברים',
  },
  reports: {
    title: 'כספים',
    mobileSubtitle: 'תקציב מול ביצוע · בנק · גבייה',
    desktopSubtitle: 'דוח תקופתי לבניין — הוצאות, בנק וגבייה',
  },
}

export function sectionFromPathname(pathname: string | null): FinanceWorkspaceSection {
  if (!pathname) return 'expenses'
  if (pathname.startsWith('/finance/bank')) return 'bank'
  if (pathname.startsWith('/finance/reports')) return 'reports'
  return 'expenses'
}

type Props = {
  /** Optional fixed section (Hub embeds without routing). */
  forcedSection?: FinanceWorkspaceSection
  projectId?: string
  projectName?: string
  isMobile?: boolean
  /** When true, skip page shell + project picker (Hub already has context). */
  embedded?: boolean
}

export function FinanceWorkspace({
  forcedSection,
  projectId,
  projectName,
  isMobile,
  embedded = false,
}: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromQuery = searchParams.get('tab')
  const querySection: FinanceWorkspaceSection | null =
    fromQuery === 'bank' || fromQuery === 'reports' || fromQuery === 'expenses'
      ? fromQuery
      : null

  const [section, setSection] = useState<FinanceWorkspaceSection>(
    forcedSection || querySection || sectionFromPathname(pathname)
  )

  useEffect(() => {
    if (forcedSection) {
      setSection(forcedSection)
      return
    }
    setSection(querySection || sectionFromPathname(pathname))
  }, [forcedSection, pathname, querySection])

  const onSelect = useCallback(
    (next: FinanceWorkspaceSection) => {
      setSection(next)
      if (embedded || forcedSection) return
      const href = SECTIONS.find((s) => s.id === next)?.href || '/finance'
      router.push(href)
    },
    [embedded, forcedSection, router]
  )

  const meta = META[section]

  const tabs = (
    <div style={{ marginBottom: embedded ? 12 : 16 }}>
      <FilterTabs
        options={SECTIONS.map((s) => ({ label: s.label, value: s.id }))}
        value={section}
        onChange={(v) => onSelect(v as FinanceWorkspaceSection)}
      />
    </div>
  )

  const panelFor = (project: { id: string; name: string }) => {
    if (section === 'bank') {
      return (
        <BuildingBankPanel
          projectId={project.id}
          projectName={project.name}
          isMobile={isMobile}
        />
      )
    }
    if (section === 'reports') {
      return (
        <BuildingReportsPanel
          projectId={project.id}
          projectName={project.name}
          isMobile={isMobile}
        />
      )
    }
    return (
      <BuildingFinancePanel
        projectId={project.id}
        projectName={project.name}
        isMobile={isMobile}
      />
    )
  }

  if (embedded && projectId && projectName) {
    return (
      <div style={{ direction: 'rtl' }}>
        {tabs}
        {panelFor({ id: projectId, name: projectName })}
      </div>
    )
  }

  return (
    <AddonFeaturePageShell
      title={meta.title}
      mobileSubtitle={meta.mobileSubtitle}
      desktopSubtitle={meta.desktopSubtitle}
    >
      {tabs}
      <AddonProjectPicker emptyHint="הוסיפו בניין בדף פרויקטים כדי לנהל כספים.">
        {(project) => panelFor(project)}
      </AddonProjectPicker>
    </AddonFeaturePageShell>
  )
}
