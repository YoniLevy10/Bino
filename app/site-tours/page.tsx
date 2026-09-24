'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppShell, Card, LoadingSpinner, PageHeader, theme } from '../components/ui'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { getIsMobileViewport } from '@/lib/mobile-viewport'

type TourRow = {
  id: string
  completed_at: string
  notes: string | null
  defect_ticket_id: string | null
  project_name: string
  project_address: string | null
  worker_name: string
  photos?: { public_url: string; mime_type: string | null }[]
}

export default function SiteToursPage() {
  const [loading, setLoading] = useState(true)
  const [tours, setTours] = useState<TourRow[]>([])
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/site-tours')
      if (!res.ok) {
        toast.error('טעינת סיורים נכשלה')
        return
      }
      const json = (await res.json()) as { tours?: TourRow[] }
      setTours(json.tours || [])
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell>
      <PageHeader title="סיורים" subtitle="היסטוריית סיורים, הערות, תמונות וממצאים מהשטח" />
      <div style={{ padding: isMobile ? 12 : 20, maxWidth: 900, margin: '0 auto' }}>
        {loading ? (
          <LoadingSpinner />
        ) : tours.length === 0 ? (
          <p style={{ textAlign: 'center', color: theme.colors.textSecondary }}>
            אין סיורים בחודשיים האחרונים
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tours.map((t) => (
              <Card key={t.id}>
                <div style={{ fontWeight: 800 }}>{t.project_name}</div>
                <div style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 }}>
                  {t.worker_name} · {new Date(t.completed_at).toLocaleString('he-IL')}
                  {t.project_address ? ` · ${t.project_address}` : ''}
                </div>
                {t.notes ? (
                  <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.45 }}>{t.notes}</p>
                ) : null}
                {t.photos && t.photos.length > 0 ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {t.photos.map((ph, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${t.id}-${idx}`}
                        src={ph.public_url}
                        alt=""
                        style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }}
                      />
                    ))}
                  </div>
                ) : null}
                {t.defect_ticket_id ? (
                  <a
                    href={`/tickets?ticket=${t.defect_ticket_id}`}
                    style={{
                      display: 'inline-block',
                      marginTop: 8,
                      color: theme.colors.primary,
                      fontWeight: 700,
                    }}
                  >
                    תקלת ליקוי מהסיור
                  </a>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
