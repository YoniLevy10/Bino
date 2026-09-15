'use client'

import type { TabMode } from '../types'

const TABS: { id: TabMode; label: string }[] = [
  { id: 'clients', label: 'לקוחות' },
  { id: 'leads', label: 'לידים' },
  { id: 'usage', label: 'שימוש' },
  { id: 'intelligence', label: 'תובנות' },
  { id: 'ops', label: 'תפעול' },
  { id: 'settings', label: 'הגדרות' },
]

export function BottomNav({
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
    <nav className="sa-bottom-nav" aria-label="ניווט Super Admin">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`sa-bottom-nav-btn${tab === item.id ? ' is-active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.id === 'ops' && opsBadge > 0 ? (
            <span className="sa-bottom-badge">{opsBadge > 99 ? '99+' : opsBadge}</span>
          ) : null}
        </button>
      ))}
    </nav>
  )
}
