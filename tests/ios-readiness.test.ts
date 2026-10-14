import { describe, expect, it } from 'vitest'
import { buildIosReadinessReport } from '@/lib/ios-readiness'

describe('buildIosReadinessReport', () => {
  it('marks team id todo when missing', () => {
    const report = buildIosReadinessReport({ appleTeamId: '', aasaHttpOk: null })
    expect(report.teamIdConfigured).toBe(false)
    expect(report.aasaBuildable).toBe(false)
    expect(report.appStoreSubmitInScope).toBe(false)
    expect(report.items.find((i) => i.id === 'apple_team_id')?.status).toBe('todo')
  })

  it('marks team id ok when valid', () => {
    const report = buildIosReadinessReport({ appleTeamId: 'AB12CD34EF', aasaHttpOk: true })
    expect(report.teamIdConfigured).toBe(true)
    expect(report.items.find((i) => i.id === 'aasa_route')?.status).toBe('ok')
    expect(report.items.find((i) => i.id === 'app_store')?.status).toBe('info')
  })
})
