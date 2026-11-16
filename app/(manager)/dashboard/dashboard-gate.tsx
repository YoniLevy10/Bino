'use client'

import dynamic from 'next/dynamic'
import { theme } from '@/app/components/ui/theme'

const DashboardClient = dynamic(() => import('./dashboard-client'), {
  ssr: false,
  loading: () => <DashboardBodyFallback />,
})

function DashboardBodyFallback() {
  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .dashboard-body-fallback { grid-template-columns: 1fr !important; padding: 0 16px 24px !important; }
        }
      `}</style>
      <div
        className="dashboard-body-fallback"
        aria-hidden
        style={{
          padding: '0 40px 32px',
          maxWidth: 1400,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
        }}
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            style={{
              minHeight: 96,
              boxSizing: 'border-box',
              borderRadius: theme.radius.lg,
              background: theme.colors.mutedSurface,
              border: `1px solid ${theme.colors.border}`,
            }}
          />
        ))}
      </div>
    </>
  )
}

/** Data UI loads after the heading is already in the document. */
export function DashboardGate() {
  return <DashboardClient />
}
