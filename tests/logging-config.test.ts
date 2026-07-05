import { describe, expect, it, vi, afterEach } from 'vitest'
import { buildDefaultLoggerConfig, LogLevel } from '@/lib/logging'

describe('buildDefaultLoggerConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses WARN and no file/remote dupes in production without LOGGING_ENDPOINT', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('LOGGING_ENDPOINT', '')
    const cfg = buildDefaultLoggerConfig()
    expect(cfg.minLevel).toBe(LogLevel.WARN)
    expect(cfg.enableFile).toBe(false)
    expect(cfg.enableRemote).toBe(false)
  })

  it('enables remote only when LOGGING_ENDPOINT is set in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('LOGGING_ENDPOINT', 'https://logs.example/v1/ingest')
    const cfg = buildDefaultLoggerConfig()
    expect(cfg.enableRemote).toBe(true)
  })

  it('keeps DEBUG in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const cfg = buildDefaultLoggerConfig()
    expect(cfg.minLevel).toBe(LogLevel.DEBUG)
  })
})
