import { describe, expect, it } from 'vitest'
import {
  WORKER_DARK_THEME_COLOR,
  WORKER_LIGHT_THEME_COLOR,
  workerDarkColors,
} from '@/lib/worker-theme'
import { theme } from '@/app/components/ui/theme'

describe('worker liquid-glass theme', () => {
  it('keeps Tide teal accent in dark outdoor palette', () => {
    expect(workerDarkColors.primary).toBe('#1F8A7E')
    expect(theme.colors.primary).toBe('#0F5C56')
    expect(workerDarkColors.accent).toBe(theme.colors.accent)
  })

  it('uses charcoal glass wash colors — not slate dashboard', () => {
    expect(workerDarkColors.background).toBe(WORKER_DARK_THEME_COLOR)
    expect(workerDarkColors.background).not.toBe('#0f172a')
    expect(WORKER_LIGHT_THEME_COLOR).toBe('#E8EEF0')
  })

  it('exposes high-contrast muted fills for outdoor status chips', () => {
    expect(workerDarkColors.successMuted).toContain('0.18')
    expect(workerDarkColors.textPrimary).toBe('#F5F5F7')
  })
})
