'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  type ReactNode,
  type CSSProperties,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from 'react'
import { createClient } from '@/utils/supabase/client'
import { clearTenantBrowserCaches } from '@/lib/tenant-browser-cache'
import { useClientBranding } from './ClientBrandingContext'
import { useSidebarNav } from './SidebarNavContext'
import { isNavItemActive, TENANT_NAV_HREFS } from '@/lib/sidebar-nav'
import { AppSplashScreen } from './AppSplashScreen'
import { shouldShowAppSplash } from '@/lib/app-splash-session'
import { ticketStatusLabelHe } from '@/lib/ticket-status'
import { navLinkPrefetchHandlers } from '@/lib/route-prefetch'
import { getIsMobileViewport } from '@/lib/mobile-viewport'

const GlobalSearch = lazy(() => import('./GlobalSearch').then((m) => ({ default: m.GlobalSearch })))

// ============================================================================
// DESIGN TOKENS - Apple-Inspired Premium Design System
// ============================================================================

export const theme = {
  colors: {
    background: '#F9F9FB',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceHover: '#F5F5F7',
    surfaceActive: '#EEEEEF',
    muted: '#F5F5F7',
    border: '#E8E8ED',
    borderSubtle: '#F0F0F2',
    borderStrong: '#D1D1D6',
    textPrimary: '#1A1A2E',
    textSecondary: '#3C3C43',
    textMuted: '#86868B',
    textInverse: '#FFFFFF',
    primary: '#0066FF',
    primaryHover: '#0055DD',
    primaryActive: '#0044BB',
    primaryMuted: 'rgba(0, 102, 255, 0.08)',
    primarySubtle: 'rgba(0, 102, 255, 0.12)',
    primaryText: '#0066FF',
    accent: '#0066FF',
    success: '#34C759',
    successMuted: '#E8F9ED',
    warning: '#FF9500',
    warningMuted: '#FFF4E5',
    error: '#FF3B30',
    errorMuted: '#FFEBE9',
    info: '#0066FF',
    infoMuted: '#E5F0FF',
    overlay: 'rgba(0, 0, 0, 0.4)',
    overlayLight: 'rgba(0, 0, 0, 0.2)',
  },
  radius: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    full: '9999px',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
    xxxl: '48px',
  },
  typography: {
    fontSize: {
      xs: '12px',
      sm: '13px',
      base: '15px',
      lg: '17px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '28px',
      '4xl': '34px',
      '5xl': '40px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  shadows: {
    none: 'none',
    xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
    sm: '0 2px 8px rgba(0, 0, 0, 0.04)',
    md: '0 4px 12px rgba(0, 0, 0, 0.06)',
    lg: '0 8px 30px rgba(0, 0, 0, 0.08)',
    xl: '0 20px 50px rgba(0, 0, 0, 0.12)',
    focus: '0 0 0 4px rgba(0, 102, 255, 0.15)',
  },
}

// ============================================================================
// NAV ICONS
// ============================================================================

const MOBILE_BOTTOM_NAV_LABELS: Partial<Record<string, string>> = {
  '/': 'בית',
  '/qr': 'QR',
  '/attendance': 'שעון',
  '/settings/whatsapp-templates': 'תבניות',
  '/pending-residents': 'ממתינים',
}

function mobileBottomNavLabel(href: string, fallback: string): string {
  return MOBILE_BOTTOM_NAV_LABELS[href] ?? fallback
}

const AppSearchContext = createContext<{ openSearch: () => void } | null>(null)

export function useAppSearch() {
  return useContext(AppSearchContext)
}

const MobileMenuContext = createContext<{
  openMenu: () => void
  closeMenu: () => void
  isOpen: boolean
  bottomNavVisible: boolean
} | null>(null)

export function useMobileMenu() {
  const ctx = useContext(MobileMenuContext)
  if (!ctx) {
    throw new Error('useMobileMenu must be used within MobileMenuProvider')
  }
  return ctx
}

export function useMobileMenuOptional() {
  return useContext(MobileMenuContext)
}

function NavIcon({ type, active }: { type: string; active?: boolean }) {
  const color = active ? theme.colors.primary : theme.colors.textMuted

  const icons: Record<string, ReactNode> = {
    home: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    grid: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </svg>
    ),
    ticket: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
        <path d="M13 5v2" />
        <path d="M13 17v2" />
        <path d="M13 11v2" />
      </svg>
    ),
    folder: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </svg>
    ),
    users: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    building: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12h4" />
        <path d="M6 16h4" />
        <path d="M14 12h4" />
        <path d="M14 16h4" />
        <path d="M6 8h4" />
        <path d="M14 8h4" />
      </svg>
    ),
    inbox: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
    message: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    qr: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect width="5" height="5" x="3" y="3" rx="1" />
        <rect width="5" height="5" x="16" y="3" rx="1" />
        <rect width="5" height="5" x="3" y="16" rx="1" />
        <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
        <path d="M21 21v.01" />
        <path d="M12 7v3a2 2 0 0 1-2 2H7" />
        <path d="M3 12h.01" />
        <path d="M12 3h.01" />
        <path d="M12 16v.01" />
        <path d="M16 12h1" />
        <path d="M21 12v.01" />
        <path d="M12 21v-1" />
      </svg>
    ),
    chart: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
    clock: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l3 2" />
      </svg>
    ),
    settings: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    lock: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect width="14" height="10" x="5" y="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  }

  return <>{icons[type] || null}</>
}

// ============================================================================
// SIGN OUT (Google OAuth session)
// ============================================================================

function NavSignOutButton({ onAfterSignOut }: { onAfterSignOut?: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true)
        try {
          const supabase = createClient()
          await supabase.auth.signOut()
          clearTenantBrowserCaches()
          onAfterSignOut?.()
          router.push('/login')
          router.refresh()
        } finally {
          setLoading(false)
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        marginTop: '6px',
        padding: '10px 12px',
        borderRadius: theme.radius.md,
        border: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        color: theme.colors.textSecondary,
        fontSize: '14px',
        fontWeight: 500,
        cursor: loading ? 'wait' : 'pointer',
        textAlign: 'start',
      }}
    >
      {loading ? 'יוצאים…' : 'יציאה מהחשבון'}
    </button>
  )
}

// ============================================================================
// SIDEBAR
// ============================================================================

export function Sidebar({ hidden }: { hidden?: boolean } = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const { navItems } = useSidebarNav()
  const { displayName, logoUrl } = useClientBranding()
  const [mounted, setMounted] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userInitials, setUserInitials] = useState('?')

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setMounted(true)
  }, [])

  useEffect(() => {
    const supabaseClient = createClient()
    supabaseClient.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? ''
      const name = data.user?.user_metadata?.full_name as string | undefined
      setUserEmail(name || email)
      if (name) {
        const parts = name.trim().split(/\s+/)
        setUserInitials(parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : parts[0].slice(0, 2).toUpperCase())
      } else if (email) {
        setUserInitials(email.slice(0, 2).toUpperCase())
      }
    }).catch(() => {})
  }, [])

  // Avoid dev-time hydration mismatches (Turbopack/HMR) by not SSR-rendering the menu.
  if (hidden) return null
  if (!mounted) return <aside style={{ display: 'none' }} aria-hidden="true" />

  return (
    <aside style={sidebarStyles.container}>
      <div style={sidebarStyles.brand}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={displayName}
            width={40}
            height={40}
            style={{ borderRadius: theme.radius.md, flexShrink: 0, objectFit: 'contain' }}
          />
        ) : (
          <Image
            src="/apple-icon.png"
            alt={displayName}
            width={40}
            height={40}
            style={{ borderRadius: theme.radius.md, flexShrink: 0 }}
          />
        )}
        <div style={sidebarStyles.brandText}>
          <div style={sidebarStyles.title}>{displayName}</div>
          <div style={sidebarStyles.subtitle}>ניהול אחזקה</div>
        </div>
      </div>

      <div style={sidebarStyles.navColumn}>
        <nav style={sidebarStyles.nav}>
          {navItems.map((item) => {
            const isActive = isNavItemActive(pathname, item)
            return (
              <Link
                key={item.id}
                href={item.href}
                {...navLinkPrefetchHandlers(item.href, router.prefetch)}
                style={{
                  ...sidebarStyles.navLink,
                  ...(isActive ? sidebarStyles.navLinkActive : {}),
                  ...(item.locked ? sidebarStyles.navLinkLocked : {}),
                }}
              >
                <NavIcon type={item.icon} active={isActive} />
                <span style={sidebarStyles.navLabel}>
                  {item.label}
                  {item.locked && (
                    <span style={sidebarStyles.navLockBadge}>בתשלום</span>
                  )}
                </span>
              </Link>
            )
          })}
        </nav>
        <div style={sidebarStyles.settingsNav}>
          <Link
            href="/settings"
            {...navLinkPrefetchHandlers('/settings', router.prefetch)}
            style={{
              ...sidebarStyles.navLink,
              ...(pathname === '/settings' ? sidebarStyles.navLinkActive : {}),
            }}
          >
            <NavIcon type="settings" active={pathname === '/settings'} />
            <span style={sidebarStyles.navLabel}>הגדרות</span>
          </Link>
          <NavSignOutButton />
        </div>
      </div>

      <div style={sidebarStyles.footer}>
        <div style={sidebarStyles.footerAvatar}>{userInitials}</div>
        <div style={sidebarStyles.footerInfo}>
          <div style={sidebarStyles.footerName}>{userEmail || '—'}</div>
          <div style={sidebarStyles.footerRole}>מנהל מערכת</div>
        </div>
      </div>
    </aside>
  )
}

const sidebarStyles: Record<string, CSSProperties> = {
  container: {
    width: '240px',
    background: theme.colors.surface,
    borderInlineEnd: `1px solid ${theme.colors.border}`,
    padding: '24px 12px',
    position: 'fixed',
    top: 0,
    insetInlineStart: 0,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 12px',
    marginBottom: '32px',
    flexShrink: 0,
  },
  logoBox: {
    width: '40px',
    height: '40px',
    borderRadius: theme.radius.md,
    background: theme.colors.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.textInverse,
    fontWeight: 700,
    fontSize: '18px',
    flexShrink: 0,
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: '17px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    marginTop: '1px',
  },
  navColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  settingsNav: {
    paddingTop: '12px',
    marginTop: '8px',
    borderTop: `1px solid ${theme.colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flexShrink: 0,
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    color: theme.colors.textSecondary,
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    minHeight: '44px',
    boxSizing: 'border-box',
    transition: 'all 0.15s ease',
  },
  navLabel: {
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: 1.25,
    flex: 1,
    minWidth: 0,
  },
  navLinkActive: {
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
  },
  navLinkLocked: {
    border: `1px dashed ${theme.colors.borderStrong}`,
    background: theme.colors.muted,
  },
  navLockBadge: {
    display: 'inline-block',
    marginInlineStart: '6px',
    fontSize: '10px',
    fontWeight: 600,
    color: theme.colors.warning,
    verticalAlign: 'middle',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 12px',
    borderTop: `1px solid ${theme.colors.border}`,
    flexShrink: 0,
  },
  footerAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: theme.radius.full,
    background: theme.colors.muted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  footerInfo: {
    flex: 1,
  },
  footerName: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  footerRole: {
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
}

// ============================================================================
// TOP BAR
// ============================================================================

export function TopBar({
  title,
  actions,
}: {
  title: string
  actions?: ReactNode
}) {
  return (
    <header style={topBarStyles.container}>
      <h1 style={topBarStyles.title}>{title}</h1>
      <div style={topBarStyles.actions}>{actions}</div>
    </header>
  )
}

const topBarStyles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 40px',
    background: theme.colors.background,
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
    letterSpacing: '-0.02em',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
}

// ============================================================================
// APP SHELL & MOBILE BOTTOM NAV
// ============================================================================

const BOTTOM_NAV_ROUTES = new Set([...TENANT_NAV_HREFS, '/settings', '/addons', '/worker'])

function showMobileBottomNavForPath(pathname: string): boolean {
  if (BOTTOM_NAV_ROUTES.has(pathname)) return true
  if (pathname === '/settings' || pathname === '/addons') return true
  return false
}

export function MobileBottomNav() {
  const { mobileBottomPrimary, mobileBottomMore } = useSidebarNav()
  const { openMenu, isOpen: menuOpen } = useMobileMenu()
  const router = useRouter()

  const pathname = usePathname()
  const settingsActive = pathname === '/settings'
  const moreActive =
    menuOpen || mobileBottomMore.some((item) => isNavItemActive(pathname, item))

  return (
    <>
      <nav style={bottomNavStyles.bar} aria-label="ניווט ראשי">
        <div style={bottomNavStyles.scroll}>
          {mobileBottomPrimary.map((item) => {
            const active = isNavItemActive(pathname, item)
            return (
              <Link
                key={item.id}
                href={item.href}
                {...navLinkPrefetchHandlers(item.href, router.prefetch)}
                style={{
                  ...bottomNavStyles.link,
                  ...(active ? bottomNavStyles.linkActive : {}),
                }}
              >
                <span style={bottomNavStyles.iconWrap}>
                  <NavIcon type={item.icon} active={active} />
                </span>
                <span style={bottomNavStyles.label}>
                  {mobileBottomNavLabel(item.href, item.label)}
                </span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={openMenu}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            aria-label="תפריט נוסף"
            style={{
              ...bottomNavStyles.link,
              border: 'none',
              background: moreActive ? theme.colors.primaryMuted : 'transparent',
              cursor: 'pointer',
              ...(moreActive ? bottomNavStyles.linkActive : {}),
            }}
          >
            <span style={bottomNavStyles.iconWrap}>
              <NavIcon type="grid" active={moreActive} />
            </span>
            <span style={bottomNavStyles.label}>עוד</span>
          </button>
        </div>
        <div style={bottomNavStyles.settingsDivider} aria-hidden />
        <Link
          href="/settings"
          style={{
            ...bottomNavStyles.link,
            ...bottomNavStyles.settingsLink,
            ...(settingsActive ? bottomNavStyles.linkActive : {}),
          }}
        >
          <span style={bottomNavStyles.iconWrap}>
            <NavIcon type="settings" active={settingsActive} />
          </span>
          <span style={bottomNavStyles.label}>הגדרות</span>
        </Link>
      </nav>
    </>
  )
}

const bottomNavStyles: Record<string, CSSProperties> = {
  bar: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    zIndex: 95,
    display: 'flex',
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    gap: 0,
    paddingTop: '6px',
    paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))',
    paddingInline: '4px',
    background: theme.colors.surface,
    borderTop: `1px solid ${theme.colors.border}`,
    boxShadow: '0 -2px 16px rgba(0,0,0,0.06)',
  },
  scroll: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    gap: '2px',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  settingsDivider: {
    width: '1px',
    alignSelf: 'stretch',
    margin: '6px 2px',
    background: theme.colors.border,
    flexShrink: 0,
  },
  link: {
    flex: '0 0 auto',
    width: '68px',
    maxWidth: '68px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    minWidth: 0,
    minHeight: '52px',
    padding: '6px 4px',
    textDecoration: 'none',
    color: theme.colors.textMuted,
    borderRadius: theme.radius.md,
    boxSizing: 'border-box',
  },
  settingsLink: {
    flex: '0 0 auto',
    width: '68px',
    maxWidth: '68px',
  },
  linkActive: {
    color: theme.colors.primary,
    background: theme.colors.primaryMuted,
  },
  iconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '24px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    lineHeight: 1.25,
    textAlign: 'center',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}

export function AppShell({
  children,
  isMobile,
}: {
  children: ReactNode
  isMobile?: boolean
}) {
  return <AppShellInner isMobile={isMobile}>{children}</AppShellInner>
}

function AppShellInner({
  children,
  isMobile,
}: {
  children: ReactNode
  isMobile?: boolean
}) {
  const { isBootstrapped } = useClientBranding()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const openSearch = useCallback(() => setSearchOpen(true), [])

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setMounted(true)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const mobile = mounted ? !!isMobile : false
  const bottomNav = mobile && showMobileBottomNavForPath(pathname)

  const showSplash = mounted && shouldShowAppSplash()

  return (
    <AppSearchContext.Provider value={{ openSearch }}>
      {showSplash ? <AppSplashScreen ready={isBootstrapped} /> : null}
      <div
        dir="rtl"
        style={{ display: 'flex', minHeight: '100vh', background: theme.colors.background }}
        suppressHydrationWarning
      >
        <Sidebar hidden={mobile} />
        <main
          dir="rtl"
          data-app-main
          style={{
            flex: 1,
            marginInlineStart: mobile ? 0 : '240px',
            minWidth: 0,
            textAlign: 'right',
              paddingBottom: bottomNav
                ? 'calc(var(--mobile-bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))'
                : undefined,
              overflowX: mobile ? 'hidden' : undefined,
              maxWidth: mobile ? '100%' : undefined,
          }}
        >
          {children}
        </main>
        {bottomNav ? <MobileBottomNav /> : null}
        <BackToTop />
        {mounted && (
          <Suspense fallback={null}>
            <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
          </Suspense>
        )}
      </div>
    </AppSearchContext.Provider>
  )
}

function BackToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 300)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!visible) return null
  return (
    <button
      type="button"
      aria-label="חזרה למעלה"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
        left: '28px',
        zIndex: 96,
        width: '48px',
        height: '48px',
        borderRadius: theme.radius.full,
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        boxShadow: theme.shadows.lg,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: theme.colors.textSecondary,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  )
}

// ============================================================================
// MOBILE HEADER
// ============================================================================

export function MobileHeader({
  title,
  subtitle,
  subtitleSuppressHydrationWarning,
  onMenuClick,
  onSearchClick,
}: {
  title: string
  subtitle?: string
  /** Use when subtitle is locale/time dependent (e.g. `formatDate()`) to avoid React #418 on SSR. */
  subtitleSuppressHydrationWarning?: boolean
  onMenuClick?: () => void
  onSearchClick?: () => void
}) {
  const appSearch = useAppSearch()
  const mobileMenu = useMobileMenuOptional()
  const handleSearch = onSearchClick ?? appSearch?.openSearch
  const showMenuButton = !!onMenuClick && !mobileMenu?.bottomNavVisible

  return (
    <header style={mobileHeaderStyles.container}>
      <div style={mobileHeaderStyles.left}>
        <div>
          <h1 style={mobileHeaderStyles.title}>{title}</h1>
          {subtitle && (
            <p
              style={mobileHeaderStyles.subtitle}
              suppressHydrationWarning={subtitleSuppressHydrationWarning}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div style={mobileHeaderStyles.actions}>
        {handleSearch && (
          <button
            type="button"
            onClick={handleSearch}
            style={mobileHeaderStyles.menuButton}
            aria-label="חיפוש"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        )}
        {showMenuButton && (
          <button
            type="button"
            onClick={onMenuClick}
            style={mobileHeaderStyles.menuButton}
            aria-label="פתיחת תפריט"
            aria-expanded={mobileMenu?.isOpen ?? false}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" x2="21" y1="6" y2="6" />
              <line x1="3" x2="21" y1="12" y2="12" />
              <line x1="3" x2="21" y1="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </header>
  )
}

const mobileHeaderStyles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 20px',
    paddingTop: 'calc(20px + env(safe-area-inset-top))',
    background: theme.colors.surface,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    minWidth: 0,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '14px',
    color: theme.colors.textMuted,
    margin: '2px 0 0 0',
  },
  menuButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: theme.radius.md,
    background: 'transparent',
    color: theme.colors.textSecondary,
    border: 'none',
    cursor: 'pointer',
  },
}

// ============================================================================
// MOBILE MENU
// ============================================================================

export function MobileMenu({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { displayName, logoUrl } = useClientBranding()
  const { navItems } = useSidebarNav()

  if (!open) return null

  return (
    <>
      <div style={mobileMenuStyles.overlay} onClick={onClose} />
      <div style={mobileMenuStyles.panel}>
        <div style={mobileMenuStyles.header}>
          <div style={mobileMenuStyles.brand}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={displayName}
                width={36}
                height={36}
                style={{ borderRadius: theme.radius.sm, objectFit: 'contain' }}
              />
            ) : (
              <Image
                src="/apple-icon.png"
                alt={displayName}
                width={36}
                height={36}
                style={{ borderRadius: theme.radius.sm }}
              />
            )}
            <span style={mobileMenuStyles.brandName}>{displayName}</span>
          </div>
          <button onClick={onClose} style={mobileMenuStyles.closeButton} aria-label="סגירת תפריט">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div style={mobileMenuStyles.navColumn}>
          <nav style={mobileMenuStyles.nav}>
            {navItems.map((item) => {
              const isActive = isNavItemActive(pathname, item)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={onClose}
                  {...navLinkPrefetchHandlers(item.href, router.prefetch)}
                  style={{
                    ...mobileMenuStyles.navLink,
                    ...(isActive ? mobileMenuStyles.navLinkActive : {}),
                  }}
                >
                  <NavIcon type={item.icon} active={isActive} />
                  <span style={mobileMenuStyles.navLabel}>{item.label}</span>
                </Link>
              )
            })}
          </nav>
          <div style={mobileMenuStyles.settingsNav}>
            <Link
              href="/settings"
              onClick={onClose}
              {...navLinkPrefetchHandlers('/settings', router.prefetch)}
              style={{
                ...mobileMenuStyles.navLink,
                ...(pathname === '/settings' ? mobileMenuStyles.navLinkActive : {}),
              }}
            >
              <NavIcon type="settings" active={pathname === '/settings'} />
              <span style={mobileMenuStyles.navLabel}>הגדרות</span>
            </Link>
            <div style={{ paddingInline: '8px', paddingTop: '8px' }}>
              <NavSignOutButton onAfterSignOut={onClose} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const openMenu = useCallback(() => setMenuOpen(true), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const bottomNavVisible = isMobile && showMobileBottomNavForPath(pathname)

  const value = useMemo(
    () => ({ openMenu, closeMenu, isOpen: menuOpen, bottomNavVisible }),
    [openMenu, closeMenu, menuOpen, bottomNavVisible]
  )

  return (
    <MobileMenuContext.Provider value={value}>
      {children}
      {isMobile ? <MobileMenu open={menuOpen} onClose={closeMenu} /> : null}
    </MobileMenuContext.Provider>
  )
}

const mobileMenuStyles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: theme.colors.overlay,
    zIndex: 200,
    animation: 'fadeIn 0.2s ease',
  },
  panel: {
    position: 'fixed',
    top: 0,
    insetInlineEnd: 0,
    bottom: 0,
    width: 'min(300px, 92vw)',
    background: theme.colors.surface,
    zIndex: 201,
    padding: '24px 16px',
    paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))',
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    display: 'flex',
    flexDirection: 'column',
    animation: 'slideInFromInlineEnd 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  navColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoBox: {
    width: '36px',
    height: '36px',
    borderRadius: theme.radius.sm,
    background: theme.colors.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.textInverse,
    fontWeight: 700,
    fontSize: '16px',
  },
  brandName: {
    fontSize: '17px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    borderRadius: theme.radius.md,
    background: 'transparent',
    color: theme.colors.textMuted,
    border: 'none',
    cursor: 'pointer',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  settingsNav: {
    marginTop: 'auto',
    paddingTop: '16px',
    borderTop: `1px solid ${theme.colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 12px',
    borderRadius: theme.radius.md,
    color: theme.colors.textSecondary,
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: 500,
    minHeight: '48px',
    boxSizing: 'border-box',
  },
  navLinkActive: {
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
  },
  navLabel: {
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: 1.25,
    flex: 1,
    minWidth: 0,
  },
}

// ============================================================================
// PAGE HEADER
// ============================================================================

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div style={pageHeaderStyles.container}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={pageHeaderStyles.title}>{title}</h1>
        {subtitle && <p style={pageHeaderStyles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div style={pageHeaderStyles.actions}>{actions}</div>}
    </div>
  )
}

const pageHeaderStyles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '24px',
    marginBottom: '32px',
    flexWrap: 'wrap',
  },
  title: {
    fontSize: '34px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: '15px',
    color: theme.colors.textMuted,
    margin: '8px 0 0 0',
    lineHeight: 1.5,
  },
  actions: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
}

// ============================================================================
// KPI CARDS
// ============================================================================

export function KpiCard({
  label,
  value,
  accent,
  onClick,
}: {
  label: string
  value: string | number
  accent?: 'primary' | 'success' | 'warning' | 'error'
  onClick?: () => void
}) {
  const accentColors = {
    primary: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error,
  }

  const accentColor = accent ? accentColors[accent] : theme.colors.border

  return (
    <button
      type="button"
      onClick={onClick}
      data-ui="kpi-card"
      style={{
        ...kpiStyles.card,
        borderInlineStartColor: accentColor,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={kpiStyles.value}>{value}</div>
      <div style={kpiStyles.label}>{label}</div>
    </button>
  )
}

const kpiStyles: Record<string, CSSProperties> = {
  card: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderInlineStart: '3px solid',
    borderRadius: theme.radius.lg,
    padding: '24px',
    textAlign: 'start',
    transition: 'all 0.2s ease',
    width: '100%',
  },
  value: {
    fontSize: '40px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    letterSpacing: '-0.03em',
    lineHeight: 1,
    marginBottom: '8px',
  },
  label: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    fontWeight: 500,
  },
}

// ============================================================================
// CARD
// ============================================================================

export function Card({
  children,
  title,
  subtitle,
  actions,
  noPadding,
  style,
}: {
  children: ReactNode
  title?: string
  subtitle?: string
  actions?: ReactNode
  noPadding?: boolean
  style?: CSSProperties
}) {
  return (
    <div style={{ ...cardStyles.container, ...style }} data-ui="card">
      {(title || actions) && (
        <div style={cardStyles.header}>
          <div>
            {title && <h3 style={cardStyles.title}>{title}</h3>}
            {subtitle && <p style={cardStyles.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div style={cardStyles.actions}>{actions}</div>}
        </div>
      )}
      <div style={noPadding ? {} : cardStyles.content}>{children}</div>
    </div>
  )
}

const cardStyles: Record<string, CSSProperties> = {
  container: {
    background: theme.colors.surface,
    borderRadius: theme.radius.xl,
    boxShadow: theme.shadows.sm,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px 24px 0',
    gap: '16px',
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: theme.colors.textMuted,
    margin: '4px 0 0',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  content: {
    padding: '24px',
  },
}

// ============================================================================
// BUTTON
// ============================================================================

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  disabled,
  loading,
  onClick,
  style: customStyle,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}) {
  const variantStyles: Record<string, CSSProperties> = {
    primary: { background: theme.colors.primary, color: theme.colors.textInverse, border: 'none' },
    secondary: { background: theme.colors.surface, color: theme.colors.textPrimary, border: `1px solid ${theme.colors.border}` },
    ghost: { background: 'transparent', color: theme.colors.textSecondary, border: 'none' },
    danger: { background: theme.colors.errorMuted, color: theme.colors.error, border: `1px solid ${theme.colors.error}` },
  }

  const sizeStyles: Record<string, CSSProperties> = {
    sm: { padding: '8px 14px', fontSize: '13px', height: '34px' },
    md: { padding: '10px 18px', fontSize: '15px', height: '40px' },
    lg: { padding: '12px 24px', fontSize: '16px', height: '48px' },
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      data-ui="button"
      data-size={size}
      className={[className].filter(Boolean).join(' ') || undefined}
      style={{
        ...buttonStyles.base,
        ...variantStyles[variant],
        ...sizeStyles[size],
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...customStyle,
      }}
      {...props}
    >
      {loading ? <span style={buttonStyles.loader} /> : children}
    </button>
  )
}

const buttonStyles: Record<string, CSSProperties> = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    borderRadius: theme.radius.md,
    fontWeight: 600,
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  loader: {
    width: '16px',
    height: '16px',
    border: '2px solid transparent',
    borderTopColor: 'currentColor',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
}

// ============================================================================
// STATUS BADGE
// ============================================================================

export function StatusBadge({
  status,
  size = 'md',
}: {
  status: string
  size?: 'sm' | 'md'
}) {
  const statusConfig: Record<string, { bg: string; text: string }> = {
    NEW: { bg: theme.colors.warningMuted, text: theme.colors.warning },
    ASSIGNED: { bg: theme.colors.infoMuted, text: theme.colors.info },
    IN_PROGRESS: { bg: theme.colors.infoMuted, text: theme.colors.info },
    WAITING_PARTS: { bg: theme.colors.warningMuted, text: theme.colors.warning },
    SITE_TOUR: { bg: '#E0E7FF', text: '#4338CA' },
    PROFESSIONAL_ESCORT: { bg: '#F3E8FF', text: '#7C3AED' },
    CLOSED: { bg: theme.colors.successMuted, text: theme.colors.success },
    ACTIVE: { bg: theme.colors.successMuted, text: theme.colors.success },
    INACTIVE: { bg: theme.colors.muted, text: theme.colors.textMuted },
    HIGH: { bg: theme.colors.errorMuted, text: theme.colors.error },
    MEDIUM: { bg: theme.colors.warningMuted, text: theme.colors.warning },
    LOW: { bg: theme.colors.infoMuted, text: theme.colors.info },
  }

  const config = statusConfig[status] || { bg: theme.colors.muted, text: theme.colors.textMuted }
  const sizeStyles = {
    sm: { padding: '4px 10px', fontSize: '11px' },
    md: { padding: '5px 12px', fontSize: '12px' },
  }

  return (
    <span style={{ ...badgeStyles.base, ...sizeStyles[size], background: config.bg, color: config.text }}>
      {ticketStatusLabelHe(status) || status.replace(/_/g, ' ')}
    </span>
  )
}

const badgeStyles: Record<string, CSSProperties> = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: theme.radius.full,
    fontWeight: 600,
    textTransform: 'capitalize',
    letterSpacing: '0.01em',
  },
}

// ============================================================================
// PRIORITY DOT
// ============================================================================

export function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    URGENT: '#b91c1c',
    HIGH: theme.colors.error,
    MEDIUM: theme.colors.warning,
    LOW: theme.colors.success,
  }

  return (
    <span style={{
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: colors[priority] || theme.colors.textMuted,
      display: 'inline-block',
      flexShrink: 0,
    }} />
  )
}

// ============================================================================
// SEARCH INPUT
// ============================================================================

export function SearchInput({
  value,
  onChange,
  placeholder = 'חיפוש...',
  style,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  style?: CSSProperties
}) {
  return (
    <div className="app-search-input-root" style={{ ...searchStyles.container, ...style }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={searchStyles.icon}>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={searchStyles.input}
      />
    </div>
  )
}

const searchStyles: Record<string, CSSProperties> = {
  container: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    maxWidth: '320px',
  },
  icon: {
    position: 'absolute',
    left: '14px',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '12px 16px 12px 44px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: '16px',
    color: theme.colors.textPrimary,
    outline: 'none',
    transition: 'all 0.15s ease',
    boxSizing: 'border-box',
  },
}

// ============================================================================
// FILTER TABS
// ============================================================================

export function FilterTabs({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="app-filter-tabs" style={filterTabStyles.container}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          style={{
            ...filterTabStyles.tab,
            ...(value === option.value ? filterTabStyles.tabActive : {}),
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const filterTabStyles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  tab: {
    padding: '8px 16px',
    borderRadius: theme.radius.sm,
    border: 'none',
    background: 'transparent',
    color: theme.colors.textMuted,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  tabActive: {
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    boxShadow: theme.shadows.xs,
  },
}

// ============================================================================
// SELECT
// ============================================================================

export function Select({
  value,
  onChange,
  options,
  placeholder,
  style,
}: {
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
  placeholder?: string
  style?: CSSProperties
}) {
  return (
    <select
      className="app-select-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...selectStyles.select, ...style }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

const selectStyles: Record<string, CSSProperties> = {
  select: {
    padding: '10px 40px 10px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: '15px',
    color: theme.colors.textPrimary,
    cursor: 'pointer',
    minWidth: '140px',
  },
}

// ============================================================================
// DRAWER
// ============================================================================

const DRAWER_FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function useFocusTrap(
  active: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  onEscape: () => void
) {
  const onEscapeRef = useRef(onEscape)

  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!active) return

    const root = containerRef.current
    if (!root) return

    const getFocusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      )

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onEscapeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = getFocusables()
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, containerRef])
}

const MOBILE_BOTTOM_NAV_CLEARANCE =
  'calc(var(--mobile-bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))'

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  isMobile,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** Sticky action bar — stays visible above mobile bottom nav while form body scrolls. */
  footer?: ReactNode
  isMobile?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const mobileMenu = useMobileMenuOptional()
  useFocusTrap(open, panelRef, onClose)

  if (!open) return null

  const mobile = !!isMobile
  const bottomNavVisible = mobile && !!mobileMenu?.bottomNavVisible
  const panelStyle: CSSProperties = mobile
    ? {
        ...drawerStyles.panelMobile,
        ...(bottomNavVisible
          ? {
              bottom: MOBILE_BOTTOM_NAV_CLEARANCE,
              maxHeight: `min(calc(92dvh - ${MOBILE_BOTTOM_NAV_CLEARANCE}), calc(100svh - ${MOBILE_BOTTOM_NAV_CLEARANCE}))`,
            }
          : {}),
      }
    : { ...drawerStyles.panelSide, width: '480px' }
  const contentStyle: CSSProperties = {
    ...drawerStyles.content,
    paddingBottom: footer
      ? '24px'
      : bottomNavVisible
        ? `calc(24px + ${MOBILE_BOTTOM_NAV_CLEARANCE})`
        : 'calc(24px + env(safe-area-inset-bottom, 0px))',
  }
  const footerStyle: CSSProperties = {
    ...drawerStyles.footer,
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
  }

  return (
    <>
      <div style={drawerStyles.overlay} onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        style={panelStyle}
        data-drawer-panel={mobile ? 'mobile' : 'desktop'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <div style={drawerStyles.header}>
          <div style={{ minWidth: 0, flex: 1, paddingInlineEnd: '8px' }}>
            <h2 id="drawer-title" style={drawerStyles.title}>
              {title}
            </h2>
            {subtitle && <p style={drawerStyles.subtitle}>{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={drawerStyles.closeButton}
            aria-label="סגירה"
            data-drawer-close
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div style={contentStyle}>{children}</div>
        {footer ? <div style={footerStyle}>{footer}</div> : null}
      </div>
    </>
  )
}

const drawerStyles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: theme.colors.overlay,
    zIndex: 300,
    animation: 'fadeIn 0.2s ease',
  },
  panelSide: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    background: theme.colors.surface,
    zIndex: 301,
    display: 'flex',
    flexDirection: 'column',
    animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    maxWidth: '100vw',
  },
  panelMobile: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    top: 'auto',
    width: '100%',
    maxHeight: 'min(92dvh, 100svh)',
    background: theme.colors.surface,
    zIndex: 301,
    display: 'flex',
    flexDirection: 'column',
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    boxShadow: '0 -8px 40px rgba(0, 0, 0, 0.12)',
    maxWidth: '100vw',
    boxSizing: 'border-box',
    WebkitOverflowScrolling: 'touch',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px',
    paddingTop: 'calc(24px + env(safe-area-inset-top))',
    borderBottom: `1px solid ${theme.colors.border}`,
    flexShrink: 0,
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: theme.colors.textMuted,
    margin: '4px 0 0',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    borderRadius: theme.radius.md,
    background: 'transparent',
    color: theme.colors.textMuted,
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
    padding: '24px',
    touchAction: 'manipulation',
  },
  footer: {
    flexShrink: 0,
    padding: '16px 24px',
    borderTop: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
}

// ============================================================================
// EMPTY STATE - single unified version
// ============================================================================

export function EmptyState({
  title,
  description,
  message,
  action,
}: {
  title: string
  description?: string
  message?: string
  action?: ReactNode | { label: string; onClick: () => void }
}) {
  const displayText = description || message

  const renderAction = () => {
    if (!action) return null
    if (typeof action === 'object' && 'label' in (action as object) && 'onClick' in (action as object)) {
      const a = action as { label: string; onClick: () => void }
      return (
        <button
          onClick={a.onClick}
          style={{
            padding: '8px 16px',
            borderRadius: theme.radius.sm,
            background: theme.colors.primary,
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            border: 'none',
            transition: 'all 0.15s ease',
          }}
        >
          {a.label}
        </button>
      )
    }
    return <div style={{ marginTop: '20px' }}>{action as ReactNode}</div>
  }

  return (
    <div style={emptyStateStyles.container}>
      <div style={emptyStateStyles.icon}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 8v13H3V8" />
          <path d="M1 3h22v5H1z" />
          <path d="M10 12h4" />
        </svg>
      </div>
      <h3 style={emptyStateStyles.title}>{title}</h3>
      {displayText && <p style={emptyStateStyles.description}>{displayText}</p>}
      {renderAction()}
    </div>
  )
}

const emptyStateStyles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 24px',
    textAlign: 'center',
  },
  icon: {
    marginBottom: '20px',
    opacity: 0.5,
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  description: {
    fontSize: '14px',
    color: theme.colors.textMuted,
    margin: '8px 0 0',
    maxWidth: '320px',
  },
}

// ============================================================================
// LOADING SPINNER
// ============================================================================

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: '20px', md: '32px', lg: '48px' }

  return (
    <div style={{
      width: sizes[size],
      height: sizes[size],
      border: `3px solid ${theme.colors.border}`,
      borderTopColor: theme.colors.primary,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  )
}

// ============================================================================
// ACTIVITY ITEM
// ============================================================================

export function ActivityItem({
  icon,
  title,
  description,
  time,
}: {
  icon: ReactNode
  title: string
  description?: string
  time: string
}) {
  return (
    <div style={activityStyles.container}>
      <div style={activityStyles.iconWrap}>{icon}</div>
      <div style={activityStyles.content}>
        <div style={activityStyles.title}>{title}</div>
        {description && <div style={activityStyles.description}>{description}</div>}
      </div>
      <div style={activityStyles.time}>{time}</div>
    </div>
  )
}

const activityStyles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 0',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  iconWrap: {
    width: '32px',
    height: '32px',
    borderRadius: theme.radius.full,
    background: theme.colors.muted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
  },
  description: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    marginTop: '2px',
  },
  time: {
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
}

// ============================================================================
// SKELETON COMPONENTS
// ============================================================================

export function Skeleton({
  width = '100%',
  height = '20px',
  borderRadius = theme.radius.sm,
}: {
  width?: string | number
  height?: string | number
  borderRadius?: string
}) {
  return (
    <div style={{
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height,
      borderRadius,
      background: `linear-gradient(90deg, ${theme.colors.muted} 25%, ${theme.colors.border} 50%, ${theme.colors.muted} 75%)`,
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }} />
  )
}

export function SkeletonCard() {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Skeleton width="40%" height="14px" />
        <Skeleton width="60%" height="28px" />
        <Skeleton width="30%" height="12px" />
      </div>
    </Card>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Skeleton width="30%" height="20px" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <Skeleton width="5%" height="16px" />
            <Skeleton width="25%" height="16px" />
            <Skeleton width="20%" height="16px" />
            <Skeleton width="15%" height="24px" borderRadius={theme.radius.full} />
            <Skeleton width="15%" height="16px" />
            <Skeleton width="10%" height="16px" />
          </div>
        ))}
      </div>
    </Card>
  )
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '16px',
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

// ============================================================================
// ERROR STATE
// ============================================================================

export function ErrorState({
  title = 'משהו השתבש',
  message = 'לא הצלחנו לטעון את הנתונים. נסו שוב.',
  retryLabel = 'נסה שוב',
  onRetry,
}: {
  title?: string
  message?: string
  retryLabel?: string
  onRetry?: () => void
}) {
  return (
    <Card>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        gap: '16px',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: theme.radius.full,
          background: '#FEE2E2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#DC2626',
          fontSize: '24px',
        }}>
          !
        </div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: theme.colors.textPrimary, marginBottom: '4px' }}>
            {title}
          </div>
          <div style={{ fontSize: '14px', color: theme.colors.textMuted }}>
            {message}
          </div>
        </div>
        {onRetry && (
          <Button variant="secondary" size="sm" type="button" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </div>
    </Card>
  )
}
