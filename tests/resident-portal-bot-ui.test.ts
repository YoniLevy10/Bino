import { describe, expect, it } from 'vitest'
import {
  isExternalResidentHref,
  residentBotVisibleActions,
  type ResidentBotAction,
} from '@/lib/resident-portal/bot-ui'
import { handleSandboxBotTurn } from '@/lib/resident-portal/sandbox-bot'

describe('residentBotVisibleActions', () => {
  it('keeps confirm + href actions and drops empty ones', () => {
    const actions: ResidentBotAction[] = [
      { type: 'create_ticket', label: 'אישור', payload: { message: 'מעלית', scope: 'common' } },
      { type: 'open_payments', label: 'תשלומים', href: '/resident/payments' },
      { type: 'none', label: 'ריק' },
      { type: 'midrag', label: 'מידרג', href: 'https://www.midrag.co.il/x' },
    ]
    const visible = residentBotVisibleActions(actions)
    expect(visible).toHaveLength(3)
    expect(visible.map((a) => a.type)).toEqual(['create_ticket', 'open_payments', 'midrag'])
  })
})

describe('isExternalResidentHref', () => {
  it('detects absolute http(s) links', () => {
    expect(isExternalResidentHref('https://www.midrag.co.il')).toBe(true)
    expect(isExternalResidentHref('/resident/payments')).toBe(false)
  })
})

describe('handleSandboxBotTurn', () => {
  it('returns payments action with in-sandbox href', () => {
    const turn = handleSandboxBotTurn({ message: 'מה היתרה לתשלום?' })
    expect(turn.reply).toMatch(/יתרה|חיוב/)
    expect(turn.actions?.[0]?.href).toBe('#payments')
  })

  it('asks for ticket confirm on fault text', () => {
    const turn = handleSandboxBotTurn({ message: 'יש תקלה במעלית' })
    expect(turn.pendingConfirm?.scope).toBe('common')
    expect(turn.actions?.some((a) => a.type === 'create_ticket')).toBe(true)
  })

  it('confirms ticket create locally', () => {
    const turn = handleSandboxBotTurn({
      message: 'יש תקלה במעלית',
      confirmCreate: true,
      scope: 'common',
    })
    expect(turn.reply).toMatch(/נפתחה קריאה/)
    expect(turn.pendingConfirm).toBeNull()
  })
})
