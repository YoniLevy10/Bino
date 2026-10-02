'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import {
  Card,
  LoadingSpinner,
  MobileHeader,
  PageHeader,
  theme,
  useMobileMenu
} from '@/app/components/ui'
import { toast } from '@/lib/error-handler'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { useSiteTours } from '@/lib/hooks/use-site-tours'

export default function SiteToursPage() {
  const [isMobile, setIsMobile] = useState(false)
  const { openMenu } = useMobileMenu()
  const { tours, isLoading, error, hasData } = useSiteTours()

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : 'טעינת סיורים נכשלה')
  }, [error])

  const showSpinner = isLoading && !hasData

  return (
    <>
      {isMobile && (
        <MobileHeader
          title="סיורים"
          subtitle="היסטוריה מהשטח"
          onMenuClick={openMenu}
        />
      )}
      <div style={styles.wrap(isMobile)}>
        {!isMobile && (
          <PageHeader title="סיורים" subtitle="היסטוריית סיורים, הערות, תמונות וממצאים מהשטח" />
        )}
        {showSpinner ? (
          <LoadingSpinner />
        ) : tours.length === 0 ? (
          <p style={styles.empty}>אין סיורים בחודשיים האחרונים</p>
        ) : (
          <div style={styles.list}>
            {tours.map((t) => (
              <Card key={t.id}>
                <div style={styles.title}>{t.project_name}</div>
                <div style={styles.meta}>
                  {t.worker_name} · {new Date(t.completed_at).toLocaleString('he-IL')}
                  {t.project_address ? ` · ${t.project_address}` : ''}
                </div>
                {t.notes ? <p style={styles.notes}>{t.notes}</p> : null}
                {t.photos && t.photos.length > 0 ? (
                  <div style={styles.photos}>
                    {t.photos.map((ph, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${t.id}-${idx}`}
                        src={ph.public_url}
                        alt=""
                        style={styles.thumb}
                      />
                    ))}
                  </div>
                ) : null}
                {t.defect_ticket_id ? (
                  <a href={`/tickets?ticket=${t.defect_ticket_id}`} style={styles.link}>
                    תקלת ליקוי מהסיור
                  </a>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

const styles = {
  wrap: (mobile: boolean): CSSProperties => ({
    padding: mobile ? '16px 16px 32px' : '32px 40px',
    maxWidth: mobile ? '100%' : 900,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  }),
  list: { display: 'flex', flexDirection: 'column' as const, gap: 10, minWidth: 0 },
  title: { fontWeight: 800, wordBreak: 'break-word' as const },
  meta: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
    wordBreak: 'break-word' as const,
    lineHeight: 1.4,
  },
  notes: {
    margin: '8px 0 0',
    fontSize: 14,
    lineHeight: 1.45,
    wordBreak: 'break-word' as const,
  },
  photos: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 8 },
  thumb: { width: 72, height: 72, objectFit: 'cover' as const, borderRadius: 8 },
  link: {
    display: 'inline-block',
    marginTop: 8,
    color: theme.colors.primary,
    fontWeight: 700,
  },
  empty: { textAlign: 'center' as const, color: theme.colors.textSecondary },
}
