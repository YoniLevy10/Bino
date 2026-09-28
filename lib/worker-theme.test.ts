import { describe, expect, it } from 'vitest'
import {
  WORKER_DARK_THEME_COLOR,
  WORKER_LIGHT_THEME_COLOR,
  workerDarkColors,
} from '@/lib/worker-theme'
import { theme } from '@/app/components/ui'

describe('worker liquid-glass theme', () => {
  it('keeps iOS system blue in dark outdoor palette', () => {
    expect(workerDarkColors.primary).toBe('#007AFF')
    expect(workerDarkColors.primary).toBe(theme.colors.primary)
  })

  it('uses charcoal glass wash colors — not slate dashboard', () => {
    expect(workerDarkColors.background).toBe(WORKER_DARK_THEME_COLOR)
    expect(workerDarkColors.background).not.toBe('#0f172a')
    expect(WORKER_LIGHT_THEME_COLOR).toBe('#dfe7f2')
  })

  it('exposes high-contrast muted fills for outdoor status chips', () => {
    expect(workerDarkColors.successMuted).toContain('0.18')
    expect(workerDarkColors.textPrimary).toBe('#F5F5F7')
  })
})
