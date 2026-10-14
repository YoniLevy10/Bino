import { describe, expect, it } from 'vitest'
import {
  formatUnknownError,
  formatUnknownErrorMessage,
  toError,
} from '@/lib/format-unknown-error'

describe('formatUnknownError', () => {
  it('reads message from plain PostgREST objects', () => {
    const msg = formatUnknownErrorMessage({
      message: 'JWT expired',
      code: 'PGRST301',
      details: 'token past exp',
      hint: 'refresh',
    })
    expect(msg).toContain('JWT expired')
    expect(msg).toContain('code=PGRST301')
    expect(msg).not.toBe('[object Object]')
  })

  it('JSON.stringifies objects without message', () => {
    expect(formatUnknownErrorMessage({ foo: 1, bar: 'x' })).toBe('{"foo":1,"bar":"x"}')
  })

  it('preserves Error message and stack', () => {
    const err = new Error('boom')
    const formatted = formatUnknownError(err)
    expect(formatted.message).toBe('boom')
    expect(formatted.stack).toContain('boom')
  })

  it('toError wraps plain objects as Error', () => {
    const err = toError({ message: 'row missing', code: '42P01' })
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('row missing')
    expect(err.message).toContain('code=42P01')
  })
})
