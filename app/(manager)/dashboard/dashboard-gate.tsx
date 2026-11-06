'use client'

import dynamic from 'next/dynamic'

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
              height: 96,
              borderRadius: 16,
              background: '#f7f9fc',
              border: '1px solid #e1e8f0',
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
