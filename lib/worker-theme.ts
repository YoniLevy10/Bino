import { theme } from '@/app/components/ui/theme'

/** Light wash — same as manager ambient background. */
export const WORKER_LIGHT_THEME_COLOR = '#dfe7f2'
/** Outdoor dark glass surface (higher opacity than manager light materials). */
export const WORKER_DARK_THEME_COLOR = '#1c1c1e'

/**
 * Dark liquid-glass palette for worker portal outdoor use.
 * Keeps iOS system blue (#007AFF) — not Tailwind slate/blue-500.
 */
export const workerDarkColors: typeof theme.colors = {
  ...theme.colors,
  background: '#1c1c1e',
  surface: 'rgba(44, 44, 46, 0.92)',
  surfaceElevated: 'rgba(58, 58, 60, 0.95)',
  surfaceHover: 'rgba(72, 72, 74, 0.9)',
  surfaceActive: 'rgba(88, 88, 90, 0.9)',
  muted: 'rgba(58, 58, 60, 0.85)',
  border: 'rgba(255, 255, 255, 0.14)',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.22)',
  textPrimary: '#F5F5F7',
  textSecondary: '#EBEBF5',
  textMuted: 'rgba(235, 235, 245, 0.6)',
  textInverse: '#FFFFFF',
  primary: '#007AFF',
  primaryHover: '#0A84FF',
  primaryActive: '#409CFF',
  primaryMuted: 'rgba(0, 122, 255, 0.22)',
  primarySubtle: 'rgba(0, 122, 255, 0.32)',
  primaryText: '#0A84FF',
  accent: '#0A84FF',
  success: '#30D158',
  successMuted: 'rgba(48, 209, 88, 0.18)',
  warning: '#FF9F0A',
  warningMuted: 'rgba(255, 159, 10, 0.18)',
  error: '#FF453A',
  errorMuted: 'rgba(255, 69, 58, 0.18)',
  info: '#0A84FF',
  infoMuted: 'rgba(10, 132, 255, 0.18)',
  overlay: 'rgba(0, 0, 0, 0.55)',
  overlayLight: 'rgba(0, 0, 0, 0.35)',
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

/** Sync PWA / Safari status-bar theme-color with light/dark worker shell. */
export function applyWorkerThemeColor(dark: boolean): void {
  if (typeof document === 'undefined') return
  const color = dark ? WORKER_DARK_THEME_COLOR : WORKER_LIGHT_THEME_COLOR
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = color
}
