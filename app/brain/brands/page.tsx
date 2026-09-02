'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

type BrandRow = {
  id: string
  name: string
  slug: string
  website: string | null
  status: string
  mbrain_brand_profiles?: {
    product_description: string | null
    target_customers: string | null
    onboarding_completed_at: string | null
  } | null
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [metaLabel, setMetaLabel] = useState<string>('MOCK DATA')

  useEffect(() => {
    void (async () => {
      try {
        const [br, dash] = await Promise.all([
          fetchWithTimeout('/api/mbrain/brands'),
          fetchWithTimeout('/api/mbrain/dashboard'),
        ])
        if (!br.ok) throw new Error('שגיאה בטעינת מותגים')
        const bj = (await br.json()) as { brands: BrandRow[] }
        setBrands(bj.brands)
        if (dash.ok) {
          const dj = (await dash.json()) as { meta: { label: string } }
          setMetaLabel(dj.meta.label)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה')
      }
    })()
  }, [])

  return (
    <BrainShell metaLabel={metaLabel}>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">מותגים — Brand Brain</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            הקשר העסקי המתמשך שה-AI משתמש בו ליצירת אסטרטגיה וקריאייטיב.
          </p>
        </div>
        {error ? <p className="text-[var(--mbrain-bad)]">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {brands.map((b) => (
            <Link key={b.id} href={`/brain/brands/${b.id}`} className="mbrain-card block p-5 hover:border-white/20">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-medium text-white">{b.name}</h3>
                  <p className="text-xs text-[var(--mbrain-muted)]">/{b.slug}</p>
                </div>
                <span className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-[var(--mbrain-muted)]">
                  {b.status}
                </span>
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-[var(--mbrain-muted)]">
                {b.mbrain_brand_profiles?.product_description || 'אין תיאור מוצר עדיין'}
              </p>
              <p className="mt-2 text-xs text-[var(--mbrain-accent)]">
                {b.mbrain_brand_profiles?.onboarding_completed_at ? 'אונבורדינג הושלם' : 'השלם Brand Brain →'}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </BrainShell>
  )
}
