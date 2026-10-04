import { theme } from '@/app/components/ui'

/** Light wash — Tide ambient (matches manager shell). */
export const WORKER_LIGHT_THEME_COLOR = '#D9E3E5'
/** Outdoor dark Tide surface. */
export const WORKER_DARK_THEME_COLOR = '#121C1B'

/**
 * Dark Tide palette for worker portal outdoor use.
 * Solid materials — no iOS liquid-glass.
 */
export const workerDarkColors: typeof theme.colors = {
  ...theme.colors,
  background: '#121C1B',
  surface: '#1A2726',
  surfaceElevated: '#1F2E2C',
  surfaceHover: '#243332',
  surfaceActive: '#2A3A38',
  muted: '#1F2A29',
  border: 'rgba(201, 228, 223, 0.14)',
  borderSubtle: 'rgba(201, 228, 223, 0.08)',
  borderStrong: 'rgba(201, 228, 223, 0.22)',
  textPrimary: '#F3FAF8',
  textSecondary: '#D5E8E4',
  textMuted: 'rgba(213, 232, 228, 0.62)',
  textInverse: '#F3FAF8',
  primary: '#16706A',
  primaryHover: '#1C857D',
  primaryActive: '#23968D',
  primaryMuted: 'rgba(22, 112, 106, 0.32)',
  primarySubtle: 'rgba(22, 112, 106, 0.42)',
  primaryText: '#A8DDD6',
  accent: '#16706A',
  success: '#3D9B5F',
  successMuted: 'rgba(61, 155, 95, 0.2)',
  warning: '#C9872A',
  warningMuted: 'rgba(201, 135, 42, 0.2)',
  error: '#D45A5A',
  errorMuted: 'rgba(212, 90, 90, 0.2)',
  info: '#6A9AAB',
  infoMuted: 'rgba(106, 154, 171, 0.2)',
  overlay: 'rgba(0, 0, 0, 0.55)',
  overlayLight: 'rgba(0, 0, 0, 0.35)',
  sidebar: '#0A322F',
  brandSoft: 'rgba(22, 112, 106, 0.35)',
  sand: '#2A2820',
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
