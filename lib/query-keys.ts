/** Central React Query keys for shared tenant data. */

export const queryKeys = {
  projects: (clientId: string) => ['projects', clientId] as const,
  workers: (clientId: string) => ['workers', clientId] as const,
  workersActive: (clientId: string) => ['workers', clientId, 'active'] as const,
  ticketsOpen: (clientId: string) => ['tickets-open', clientId] as const,
  entitlements: (clientId: string) => ['entitlements', clientId] as const,
  navConfig: (clientId: string) => ['nav-config', clientId] as const,
  branding: (clientId: string) => ['branding', clientId] as const,
  billingSummary: (clientId: string) => ['billing-summary', clientId] as const,
  maintenanceTasks: (clientId: string) => ['maintenance-tasks', clientId] as const,
  siteTours: (clientId: string) => ['site-tours', clientId] as const,
  settings: (clientId: string) => ['settings', clientId] as const,
  whatsappConversations: (clientId: string) => ['whatsapp-conversations', clientId] as const,
  attendanceDashboard: (clientId: string, from: string, to: string) =>
    ['attendance-dashboard', clientId, from, to] as const,
}
