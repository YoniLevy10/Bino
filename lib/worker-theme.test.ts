import { describe, expect, it } from 'vitest'
import {
  WORKER_DARK_THEME_COLOR,
  WORKER_LIGHT_THEME_COLOR,
  workerDarkColors,
} from '@/lib/worker-theme'
import { theme } from '@/app/components/ui/theme'

describe('worker Tide theme', () => {
  it('uses Tide teal accents in dark outdoor palette', () => {
    expect(workerDarkColors.primary).toBe('#16706A')
    expect(theme.colors.primary).toBe('#0B4A45')
    expect(workerDarkColors.accent).toBe(theme.colors.accent)
  })

  it('uses Tide charcoal wash — not slate dashboard', () => {
    expect(workerDarkColors.background).toBe(WORKER_DARK_THEME_COLOR)
    expect(workerDarkColors.background).not.toBe('#0f172a')
    expect(WORKER_LIGHT_THEME_COLOR).toBe('#D9E3E5')
  })

  it('exposes muted fills for outdoor status chips', () => {
    expect(workerDarkColors.successMuted).toContain('0.2')
    expect(workerDarkColors.textPrimary).toBe('#F3FAF8')
  })
})
