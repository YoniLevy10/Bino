import { theme } from '@/app/components/ui'

/** Dark palette for worker portal high-contrast outdoor use. */
export const workerDarkColors: typeof theme.colors = {
  ...theme.colors,
  background: '#0f172a',
  surface: '#1e293b',
  surfaceElevated: '#334155',
  surfaceHover: '#334155',
  surfaceActive: '#475569',
  muted: '#334155',
  border: '#475569',
  borderSubtle: '#334155',
  borderStrong: '#64748b',
  textPrimary: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  primaryMuted: 'rgba(59, 130, 246, 0.18)',
  primarySubtle: 'rgba(59, 130, 246, 0.24)',
  successMuted: 'rgba(52, 211, 153, 0.15)',
  warningMuted: 'rgba(251, 191, 36, 0.15)',
  errorMuted: 'rgba(248, 113, 113, 0.15)',
  infoMuted: 'rgba(59, 130, 246, 0.15)',
}

export const WORKER_DARK_MODE_KEY = 'bamakor_worker_dark_mode'

export function readWorkerDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(WORKER_DARK_MODE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeWorkerDarkMode(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(WORKER_DARK_MODE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}
