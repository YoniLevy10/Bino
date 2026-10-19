'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type MouseEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
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

async function persistMembershipContext(membershipId: string): Promise<boolean> {
  const res = await fetch('/api/resident/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ membershipId }),
  })
  return res.ok
}

export function ResidentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [memberships, setMemberships] = useState<MembershipSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [contextReady, setContextReady] = useState(false)

  const hideChrome =
    pathname === '/resident/login' ||
    pathname.startsWith('/resident/login') ||
    pathname.startsWith('/resident/join') ||
    pathname.startsWith('/resident/accept-invite') ||
    pathname.startsWith('/resident/sandbox')

  const onChat = (pathname || '').startsWith('/resident/chat')

  const loadMemberships = useCallback(async () => {
    if (hideChrome) {
      setLoading(false)
      setContextReady(true)
      return
    }
    setLoading(true)
    setError('')
    setContextReady(false)
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
        return
      }
      // Always bind a membership cookie so bot/home/tickets APIs resolve.
      // Prefer previously selected id when still in the list; else first.
      const preferred =
        (activeId && list.find((m) => m.id === activeId)?.id) || list[0].id
      setActiveId(preferred)
      const ok = await persistMembershipContext(preferred)
      if (!ok) {
        setError('בחירת דירה נכשלה — נסו שוב או פנו לחברת הניהול')
        return
      }
      setContextReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
    // activeId intentionally omitted — only seed from prior selection once per load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideChrome, router])

  useEffect(() => {
    void loadMemberships()
  }, [loadMemberships])

  async function selectMembership(id: string) {
    setActiveId(id)
    setContextReady(false)
    const ok = await persistMembershipContext(id)
    if (!ok) {
      setError('בחירת דירה נכשלה')
      return
    }
    setContextReady(true)
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

  function openBot(e?: MouseEvent) {
    e?.preventDefault()
    router.push('/resident/chat')
  }

  if (hideChrome) {
    return <>{children}</>
  }

  const active = memberships.find((m) => m.id === activeId) || memberships[0]
  const showChildren = !loading && !(error && memberships.length === 0) && contextReady

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
        {loading || (!contextReady && memberships.length > 0 && !error) ? (
          <ResidentMuted>טוען…</ResidentMuted>
        ) : error && memberships.length === 0 ? (
          <ResidentAlert tone="error">{error}</ResidentAlert>
        ) : error && !showChildren ? (
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

      {/* Bot FAB — always wired to in-app deterministic portal chat (not WhatsApp). */}
      {!onChat ? (
        <Link
          href="/resident/chat"
          aria-label="שיחה עם הבוט — פתיחת תקלה, תשלומים ומידע"
          title="שיחה עם הבוט"
          className="lg-btn lg-btn-primary resident-bot-fab"
          style={residentShellStyles.fab}
          onClick={openBot}
        >
          <span aria-hidden style={{ display: 'grid', gap: 1, placeItems: 'center', lineHeight: 1.1 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3a7 7 0 0 0-7 7v1.5A2.5 2.5 0 0 0 7.5 14H8v3l3.2-2.4c.26-.2.58-.3.9-.3H12a7 7 0 0 0 0-14Z"
                fill="currentColor"
                opacity="0.95"
              />
              <circle cx="9.2" cy="10.2" r="1" fill="#007aff" />
              <circle cx="12" cy="10.2" r="1" fill="#007aff" />
              <circle cx="14.8" cy="10.2" r="1" fill="#007aff" />
            </svg>
            <span style={{ fontSize: 11, fontWeight: 700 }}>בוט</span>
          </span>
        </Link>
      ) : (
        <Link
          href="/resident/tickets"
          aria-label="מעבר לטופס תקלות"
          className="lg-btn resident-bot-fab"
          style={{
            ...residentShellStyles.fab,
            background: 'rgba(255,255,255,0.85)',
            color: residentTheme.colors.primary,
            fontSize: 12,
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 22px rgba(0,70,150,0.12)',
          }}
        >
          טופס
        </Link>
      )}
    </div>
  )
}
