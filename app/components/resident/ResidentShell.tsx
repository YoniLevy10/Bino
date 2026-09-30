'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { clearTenantBrowserCaches } from '@/lib/tenant-browser-cache'

type MembershipSummary = {
  id: string
  project_name: string | null
  apartment_number: string | null
  client_name: string | null
  client_logo_url: string | null
}

const NAV = [
  { href: '/resident', label: 'בית', match: (p: string) => p === '/resident' },
  {
    href: '/resident/payments',
    label: 'תשלומים',
    match: (p: string) => p.startsWith('/resident/payments'),
  },
  {
    href: '/resident/tickets',
    label: 'תקלות',
    match: (p: string) => p.startsWith('/resident/tickets'),
  },
  {
    href: '/resident/information',
    label: 'מידע',
    match: (p: string) => p.startsWith('/resident/information'),
  },
] as const

export function ResidentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [memberships, setMemberships] = useState<MembershipSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const hideChrome =
    pathname === '/resident/login' ||
    pathname.startsWith('/resident/login') ||
    pathname.startsWith('/resident/accept-invite')

  const loadMemberships = useCallback(async () => {
    if (hideChrome) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/resident/memberships')
      const json = (await res.json()) as {
        memberships?: MembershipSummary[]
        error?: string
      }
      if (!res.ok) {
        if (res.status === 401) {
          router.replace('/resident/login')
          return
        }
        setError(json.error || 'טעינת דירות נכשלה')
        setMemberships([])
        return
      }
      const list = json.memberships || []
      setMemberships(list)
      if (list.length === 0) {
        setError('אין חברות פעילה בפורטל. פנו לחברת הניהול לקבלת הזמנה.')
      } else if (list.length === 1) {
        setActiveId(list[0].id)
        await fetch('/api/resident/context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ membershipId: list[0].id }),
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }, [hideChrome, router])

  useEffect(() => {
    void loadMemberships()
  }, [loadMemberships])

  async function selectMembership(id: string) {
    setActiveId(id)
    const res = await fetch('/api/resident/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membershipId: id }),
    })
    if (!res.ok) {
      const json = (await res.json()) as { error?: string }
      setError(json.error || 'בחירת דירה נכשלה')
      return
    }
    // Clear any client query cache by hard navigation refresh.
    router.refresh()
    window.location.href = pathname || '/resident'
  }

  async function signOut() {
    const supabase = createClient()
    await fetch('/api/resident/context', { method: 'DELETE' }).catch(() => {})
    await supabase.auth.signOut()
    clearTenantBrowserCaches()
    router.replace('/resident/login')
  }

  if (hideChrome) {
    return <>{children}</>
  }

  const active = memberships.find((m) => m.id === activeId) || memberships[0]

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#F2F4F8',
        color: '#1A1A2E',
        fontFamily: 'var(--font-heebo), sans-serif',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: '#fff',
          borderBottom: '1px solid #E8E8ED',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {active?.client_logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.client_logo_url}
            alt=""
            width={36}
            height={36}
            style={{ borderRadius: 8, objectFit: 'contain' }}
          />
        ) : (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: '#007AFF',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700,
            }}
          >
            B
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {active?.client_name || 'פורטל דיירים'}
          </div>
          <div style={{ fontSize: 13, color: '#86868B' }}>
            {active?.project_name || '—'}
            {active?.apartment_number ? ` · דירה ${active.apartment_number}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#007AFF',
            fontSize: 14,
            minHeight: 44,
            padding: '0 8px',
          }}
        >
          יציאה
        </button>
      </header>

      {memberships.length > 1 ? (
        <div style={{ padding: '8px 16px', background: '#fff', borderBottom: '1px solid #E8E8ED' }}>
          <label style={{ fontSize: 12, color: '#86868B', display: 'block', marginBottom: 4 }}>
            בחירת דירה
          </label>
          <select
            value={active?.id || ''}
            onChange={(e) => void selectMembership(e.target.value)}
            style={{
              width: '100%',
              minHeight: 44,
              fontSize: 16,
              borderRadius: 10,
              border: '1px solid #D1D1D6',
              padding: '8px 12px',
              background: '#fff',
            }}
          >
            {memberships.map((m) => (
              <option key={m.id} value={m.id}>
                {m.client_name} · {m.project_name}
                {m.apartment_number ? ` · דירה ${m.apartment_number}` : ''}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <main style={{ flex: 1, padding: '16px 16px 96px', maxWidth: 560, width: '100%', margin: '0 auto' }}>
        {loading ? (
          <p style={{ color: '#86868B' }}>טוען…</p>
        ) : error && memberships.length === 0 ? (
          <div
            role="alert"
            style={{
              background: '#FFEBE9',
              color: '#FF3B30',
              padding: 16,
              borderRadius: 12,
            }}
          >
            {error}
          </div>
        ) : (
          children
        )}
      </main>

      <nav
        aria-label="ניווט פורטל דיירים"
        style={{
          position: 'fixed',
          bottom: 0,
          insetInline: 0,
          background: '#fff',
          borderTop: '1px solid #E8E8ED',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          zIndex: 30,
        }}
      >
        {NAV.map((item) => {
          const activeNav = item.match(pathname || '')
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                textAlign: 'center',
                padding: '10px 4px',
                minHeight: 56,
                textDecoration: 'none',
                color: activeNav ? '#007AFF' : '#86868B',
                fontWeight: activeNav ? 700 : 500,
                fontSize: 13,
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <Link
        href="/resident/chat"
        aria-label="שיחה עם הבוט"
        style={{
          position: 'fixed',
          bottom: 72,
          left: 16,
          width: 56,
          height: 56,
          borderRadius: 28,
          background: '#007AFF',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          textDecoration: 'none',
          fontWeight: 700,
          boxShadow: '0 8px 24px rgba(0,122,255,0.35)',
          zIndex: 40,
        }}
      >
        בוט
      </Link>
    </div>
  )
}
