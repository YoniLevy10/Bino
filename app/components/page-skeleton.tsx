'use client'

import type { CSSProperties } from 'react'
import { PageTransitionLoader } from './PageTransitionLoader'
import { theme } from './ui/theme'

function SkeletonBar({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width,
        height,
        borderRadius: 8,
        background: `linear-gradient(90deg, ${theme.colors.border} 0%, ${theme.colors.surface} 50%, ${theme.colors.border} 100%)`,
        backgroundSize: '200% 100%',
        animation: 'bino-skel 1.2s ease-in-out infinite',
      }}
    />
  )
}

/**
 * In-page list skeleton — keeps chrome/tabs visible during warm nav.
 * Prefer this over a full-viewport spinner once AppShell is persistent.
 */
export function PageListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="טוען"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}
    >
      <style>{`@keyframes bino-skel { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            background: theme.colors.surface,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <SkeletonBar width={`${70 - (i % 3) * 10}%`} height={16} />
          <SkeletonBar width={`${50 + (i % 4) * 8}%`} height={12} />
          <SkeletonBar width="36%" height={10} />
        </div>
      ))}
    </div>
  )
}

export function PageKpiSkeleton() {
  return (
    <div
      role="status"
      aria-label="טוען"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}
    >
      <style>{`@keyframes bino-skel { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }`}</style>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            background: theme.colors.surface,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <SkeletonBar width="40%" height={12} />
          <SkeletonBar width="55%" height={22} />
        </div>
      ))}
    </div>
  )
}

export function PageKpiSkeletonN({ columns = 4 }: { columns?: number }) {
  return (
    <div
      role="status"
      aria-label="טוען"
      style={
        {
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 12,
        } as CSSProperties
      }
    >
      <PageKpiSkeleton />
    </div>
  )
}

/** Inline section loader — keeps tabs/filters visible while content loads. */
export function SectionLoader() {
  return <PageListSkeleton rows={4} />
}

export { PageTransitionLoader }
