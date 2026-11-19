'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { clearTenantBrowserCaches } from '@/lib/tenant/tenant-browser-cache'
import { fetchWithTimeout } from '@/lib/shared/fetch-with-timeout'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
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
    href: '/resident/decisions',
    label: 'אישורים',
    icon: 'info' as const,
    match: (p: string) => p.startsWith('/resident/decisions'),
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
  const isMobile = useIsMobile()
  const [memberships, setMemberships] = useState<MembershipSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingApprovals, setPendingApprovals] = useState(0)

  const hideChrome =
    pathname === '/resident/login' ||
    pathname.startsWith('/resident/login') ||
    pathname.startsWith('/resident/join') ||
    pathname.startsWith('/resident/demo') ||
    pathname.startsWith('/resident/accept-invite') ||
    pathname.startsWith('/resident/sandbox')

  const refreshPendingApprovals = useCallback(async () => {
    try {
      const res = await fetchWithTimeout('/api/resident/approvals/pending')
      if (!res.ok) {
        setPendingApprovals(0)
        return
      }
      const json = (await res.json()) as { pendingApprovals?: number }
      setPendingApprovals(Math.max(0, Number(json.pendingApprovals || 0)))
    } catch {
      setPendingApprovals(0)
    }
  }, [])

  const loadMemberships = useCallback(async () => {
    if (hideChrome) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetchWithTimeout('/api/resident/memberships')
      const json = (await res.json()) as {
        memberships?: MembershipSummary[]
        error?: string
      }
      if (!res.ok) {
        if (res.status === 401) {
          // Full navigation so stale manager cookies / soft-nav races cannot leave
          // the shell stuck on «טוען…» with children never mounting.
          window.location.replace('/resident/login')
          return
        }
        setError(json.error || 'טעינת דירות נכשלה')
        setMemberships([])
        setPendingApprovals(0)
        return
      }
      const list = json.memberships || []
      setMemberships(list)
      if (list.length === 0) {
        setError('אין חברות פעילה בפורטל. פנו לחברת הניהול לקבלת הזמנה.')
        setActiveId(null)
        setPendingApprovals(0)
      } else {
        // API orders oldest→newest; prefer newest so demo re-login wins over stale rows.
        const preferred = list[list.length - 1]!
        setActiveId(preferred.id)
        const ctxRes = await fetchWithTimeout('/api/resident/context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ membershipId: preferred.id }),
        })
        if (!ctxRes.ok) {
          setError('לא ניתן להפעיל את הדירה — התחברו מחדש דרך קישור הבניין או /resident/demo')
          setPendingApprovals(0)
        } else {
          await refreshPendingApprovals()
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }, [hideChrome, router, refreshPendingApprovals])

  useEffect(() => {
    void loadMemberships()
  }, [loadMemberships])

  async function selectMembership(id: string) {
    setActiveId(id)
    const res = await fetchWithTimeout('/api/resident/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membershipId: id }),
    })
    if (!res.ok) {
      const json = (await res.json()) as { error?: string }
      setError(json.error || 'בחירת דירה נכשלה')
      return
    }
    await refreshPendingApprovals()
    router.refresh()
    window.location.href = pathname || '/resident'
  }

  async function signOut() {
    const supabase = createClient()
    await fetchWithTimeout('/api/resident/context', { method: 'DELETE' }).catch(() => {})
    await supabase.auth.signOut()
    clearTenantBrowserCaches()
    router.replace('/resident/login')
  }

  if (hideChrome) {
    return <>{children}</>
  }

  const active = memberships.find((m) => m.id === activeId) || memberships[0]
  const mainStyle = {
    ...residentShellStyles.main,
    ...(isMobile
      ? null
      : {
          maxWidth: 880,
          paddingInline: 28,
          paddingTop: 22,
        }),
  }
  const tabbarStyle = {
    ...residentShellStyles.tabbar,
    gridTemplateColumns: `repeat(${NAV.length}, 1fr)`,
    ...(isMobile
      ? null
      : {
          insetInline: 'max(12px, calc(50% - 440px))',
          maxWidth: 880,
          marginInline: 'auto',
        }),
  }

  return (
    <div className="resident-shell" style={residentShellStyles.root} dir="rtl">
      <ResidentAmbientWash />

      <header
        className="lg-chrome resident-shell-header"
        style={{
          ...residentShellStyles.header,
          ...(isMobile ? null : { paddingInline: 28, paddingBlock: 16 }),
        }}
      >
        <div
          className="resident-shell-header-inner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? 12 : 14,
            width: '100%',
            ...(isMobile ? null : residentShellStyles.headerInnerWide),
          }}
        >
          {active?.client_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active.client_logo_url}
              alt=""
              width={isMobile ? 36 : 44}
              height={isMobile ? 36 : 44}
              style={{
                borderRadius: residentTheme.radius.md,
                objectFit: 'contain',
                width: isMobile ? 36 : 44,
                height: isMobile ? 36 : 44,
              }}
            />
          ) : (
            <div
              style={{
                ...residentShellStyles.logoMark,
                ...(isMobile ? null : { width: 44, height: 44, fontSize: 17 }),
              }}
            >
              B
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={residentShellStyles.eyebrow}>אזור אישי לדייר</div>
            <div style={{ ...residentShellStyles.title, ...(isMobile ? null : { fontSize: '1.15rem' }) }}>
              {active?.client_name || 'פורטל דיירים'}
            </div>
            <div style={residentShellStyles.subtitle}>
              {active?.project_name || '—'}
              {active?.apartment_number ? ` · דירה ${active.apartment_number}` : ''}
            </div>
          </div>
          <button type="button" onClick={() => void signOut()} style={residentShellStyles.headerAction}>
            יציאה
          </button>
        </div>
      </header>

      {memberships.length > 1 ? (
        <div
          className="lg-glass"
          style={{
            margin: isMobile ? '8px 16px 0' : '12px auto 0',
            maxWidth: isMobile ? undefined : 880,
            width: isMobile ? undefined : 'calc(100% - 56px)',
            padding: '10px 12px',
            borderRadius: residentTheme.radius.lg,
            boxSizing: 'border-box',
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

      <main style={mainStyle}>
        {loading ? (
          <ResidentMuted>טוען…</ResidentMuted>
        ) : error && memberships.length === 0 ? (
          <ResidentAlert tone="error">{error}</ResidentAlert>
        ) : (
          children
        )}
      </main>

      <nav className="lg-tabbar" aria-label="ניווט פורטל דיירים" style={tabbarStyle}>
        {NAV.map((item) => {
          const activeNav = item.match(pathname || '')
          const showBadge =
            item.href === '/resident/decisions' && pendingApprovals > 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={activeNav ? 'lg-nav-active' : undefined}
              aria-label={
                showBadge
                  ? `${item.label} — ${pendingApprovals} ממתינים`
                  : undefined
              }
              style={{
                ...residentShellStyles.tabItem,
                ...(activeNav ? residentShellStyles.tabItemActive : null),
              }}
            >
              <span className="resident-shell-tab-icon-wrap">
                <ResidentNavIcon name={item.icon} active={activeNav} />
                {showBadge ? (
                  <span className="resident-shell-tab-badge">
                    {pendingApprovals > 99 ? '99+' : pendingApprovals}
                  </span>
                ) : null}
              </span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
