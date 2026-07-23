import { SIDEBAR_NAV_REGISTRY, type SidebarNavItemId } from '@/lib/sidebar-nav'

/** Map a dashboard pathname to a stable nav / analytics id. Safe for client bundles. */
export function navIdFromPathname(pathname: string): string | null {
  if (!pathname || pathname.startsWith('/api')) return null
  if (pathname === '/') return 'dashboard'
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    if (pathname.startsWith('/settings/whatsapp-templates')) return 'whatsapp_templates'
    return 'settings'
  }
  if (pathname === '/addons' || pathname.startsWith('/addons/')) return 'addons'
  if (pathname === '/billing' || pathname.startsWith('/billing/')) return 'billing'
  // Exact worker portal routes only — do not match `/workers` (tenant staff list).
  if (pathname === '/worker' || pathname.startsWith('/worker/') || pathname === '/worker-login') {
    return 'worker_portal'
  }
  if (pathname.startsWith('/login') || pathname.startsWith('/superadmin') || pathname.startsWith('/admin')) {
    return null
  }

  for (const [id, item] of Object.entries(SIDEBAR_NAV_REGISTRY) as [SidebarNavItemId, { href: string }][]) {
    if (item.href === pathname || (item.href !== '/' && pathname.startsWith(`${item.href}/`))) {
      return id
    }
  }
  return null
}
