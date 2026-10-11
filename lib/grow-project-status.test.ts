import { describe, expect, it } from 'vitest'
import { growProjectStatusView } from '@/lib/grow-project-status'

describe('growProjectStatusView', () => {
  it('marks connected when ready + userId', () => {
    const st = growProjectStatusView({
      grow_enabled: true,
      grow_user_id: 'abc1234567890',
      ready: true,
    })
    expect(st.tone).toBe('ok')
    expect(st.label).toBe('מחובר')
    expect(st.userIdShort).toBe('abc1234567…')
    expect(st.ready).toBe(true)
  })

  it('shows pending onboarding', () => {
    const st = growProjectStatusView({ grow_onboarding_status: 'pending' })
    expect(st.tone).toBe('pending')
    expect(st.label).toBe('ממתין לאישור')
    expect(st.ready).toBe(false)
  })

  it('shows not connected by default', () => {
    const st = growProjectStatusView({})
    expect(st.tone).toBe('off')
    expect(st.label).toBe('לא מחובר')
    expect(st.userId).toBeNull()
  })
})
