'use client'

import dynamic from 'next/dynamic'

const TicketsClient = dynamic(() => import('./tickets-client'), {
  ssr: false,
  loading: () => (
    <>
      <style>{`
        @media (max-width: 768px) {
          .tickets-body-fallback { padding: 16px !important; }
        }
      `}</style>
      <div
        className="tickets-body-fallback"
        aria-hidden
        style={{
          padding: '0 40px 32px',
          maxWidth: 1400,
          margin: '0 auto',
          display: 'grid',
          gap: 12,
        }}
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            style={{
              height: 64,
              borderRadius: 12,
              background: '#f7f9fc',
              border: '1px solid #e1e8f0',
            }}
          />
        ))}
      </div>
    </>
  ),
})

/** Ticket list loads after the heading is already in the document. */
export function TicketsGate() {
  return <TicketsClient />
}
