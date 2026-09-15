'use client'

import type { TabMode } from '../types'

const TABS: { id: TabMode; label: string }[] = [
  { id: 'clients', label: 'לקוחות' },
  { id: 'leads', label: 'לידים' },
  { id: 'usage', label: 'שימוש' },
  { id: 'ops', label: 'תפעול' },
  { id: 'settings', label: 'הגדרות' },
]

/** Desktop top tab bar — bottom nav is hidden from 768px up. */
export function DesktopTabBar({
  tab,
  opsBadge,
  onChange,
  hidden,
}: {
  tab: TabMode
  opsBadge: number
  onChange: (tab: TabMode) => void
  hidden?: boolean
}) {
  if (hidden) return null
  return (
    <nav className="sa-tab-bar sa-desktop-only" aria-label="ניווט Super Admin — דסקטופ">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`sa-tab-btn${tab === item.id ? ' is-active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.id === 'ops' && opsBadge > 0 ? (
            <span className="sa-tab-badge">{opsBadge > 99 ? '99+' : opsBadge}</span>
          ) : null}
        </button>
      ))}
    </nav>
  )
}
