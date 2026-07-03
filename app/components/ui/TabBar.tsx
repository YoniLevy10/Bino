'use client'

import type { CSSProperties, ReactNode } from 'react'
import { theme } from '../ui'

export type TabBarItem<T extends string = string> = {
  id: T
  label: ReactNode
}

type TabBarProps<T extends string> = {
  tabs: TabBarItem<T>[]
  activeTab: T
  onTabChange: (tab: T) => void
  ariaLabel?: string
}

export function TabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel = 'טאבים',
}: TabBarProps<T>) {
  return (
    <div style={styles.tabBar} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          style={{
            ...styles.tab,
            ...(activeTab === tab.id ? styles.tabActive : styles.tabInactive),
          }}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  tab: {
    flex: 1,
    minHeight: '44px',
    padding: '8px 4px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  tabActive: {
    background: theme.colors.surface,
    color: theme.colors.primary,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  tabInactive: {
    background: 'transparent',
    color: theme.colors.textMuted,
  },
}
