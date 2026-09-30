'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { clearTenantBrowserCaches } from '@/lib/tenant-browser-cache'
import {
  ResidentAmbientWash,
  ResidentAlert,
  ResidentMuted,
  ResidentNavIcon,
  residentShellStyles,
  residentTheme,
} from '@/app/components/resident/residentUi'

type MembershipSummary = {
  id: string
  project_name: string | null
  apartment_number: string | null
  client_name: string | null
  client_logo_url: string | null
}

const NAV = [
  {
    href: '/resident',
    label: 'בית',
    icon: 'home' as const,
    match: (p: string) => p === '/resident',
  },
  {
    href: '/resident/payments',
    label: 'תשלומים',
    icon: 'payments' as const,
    match: (p: string) => p.startsWith('/resident/payments'),
  },
  {
    href: '/resident/tickets',
    label: 'תקלות',
    icon: 'tickets' as const,
    match: (p: string) => p.startsWith('/resident/tickets'),
  },
  {
    href: '/resident/information',
    label: 'מידע',
    icon: 'info' as const,
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
    pathname.startsWith('/resident/accept-invite') ||
    pathname.startsWith('/resident/sandbox')

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
    <div className="resident-shell" style={residentShellStyles.root} dir="rtl">
      <ResidentAmbientWash />

      <header className="lg-chrome" style={residentShellStyles.header}>
        {active?.client_logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.client_logo_url}
            alt=""
            width={36}
            height={36}
            style={{ borderRadius: residentTheme.radius.md, objectFit: 'contain' }}
          />
        ) : (
          <div style={residentShellStyles.logoMark}>B</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={residentShellStyles.title}>{active?.client_name || 'פורטל דיירים'}</div>
          <div style={residentShellStyles.subtitle}>
            {active?.project_name || '—'}
            {active?.apartment_number ? ` · דירה ${active.apartment_number}` : ''}
          </div>
        </div>
        <button type="button" onClick={() => void signOut()} style={residentShellStyles.headerAction}>
          יציאה
        </button>
      </header>

      {memberships.length > 1 ? (
        <div
          className="lg-glass"
          style={{
            margin: '8px 16px 0',
            padding: '10px 12px',
            borderRadius: residentTheme.radius.lg,
          }}
        >
          <label style={{ fontSize: 12, color: residentTheme.colors.textMuted, display: 'block', marginBottom: 4 }}>
            בחירת דירה
          </label>
          <select
            className="lg-field"
            value={active?.id || ''}
            onChange={(e) => void selectMembership(e.target.value)}
            style={{
              width: '100%',
              minHeight: 44,
              fontSize: 16,
              padding: '8px 12px',
              color: residentTheme.colors.textPrimary,
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

      <main style={residentShellStyles.main}>
        {loading ? (
          <ResidentMuted>טוען…</ResidentMuted>
        ) : error && memberships.length === 0 ? (
          <ResidentAlert tone="error">{error}</ResidentAlert>
        ) : (
          children
        )}
      </main>

      <nav className="lg-tabbar" aria-label="ניווט פורטל דיירים" style={residentShellStyles.tabbar}>
        {NAV.map((item) => {
          const activeNav = item.match(pathname || '')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={activeNav ? 'lg-nav-active' : undefined}
              style={{
                ...residentShellStyles.tabItem,
                ...(activeNav ? residentShellStyles.tabItemActive : null),
              }}
            >
              <ResidentNavIcon name={item.icon} active={activeNav} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <Link
        href="/resident/chat"
        aria-label="שיחה עם הבוט"
        className="lg-btn lg-btn-primary"
        style={residentShellStyles.fab}
      >
        בוט
      </Link>
    </div>
  )
}
