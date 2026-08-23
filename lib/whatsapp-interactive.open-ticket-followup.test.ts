import { describe, expect, it } from 'vitest'
import {
  buildOpenTicketFollowupButtonsPayload,
  parseOpenTicketFollowupReplyId,
} from './whatsapp-interactive'

describe('open ticket followup interactive buttons', () => {
  it('parses update / new reply ids', () => {
    expect(parseOpenTicketFollowupReplyId('open_ticket_update')).toBe('update')
    expect(parseOpenTicketFollowupReplyId('open_ticket_new')).toBe('new')
    expect(parseOpenTicketFollowupReplyId('last_proj_same')).toBeNull()
  })

  it('builds Hebrew button titles within WhatsApp limits', () => {
    const payload = buildOpenTicketFollowupButtonsPayload(
      '972501234567',
      'יש לך תקלה פתוחה #12. זה עדכון לתקלה הקיימת, או תקלה חדשה?',
      'he'
    ) as {
      interactive: {
        action: { buttons: Array<{ reply: { id: string; title: string } }> }
      }
    }
    const buttons = payload.interactive.action.buttons
    expect(buttons).toHaveLength(2)
    expect(buttons[0].reply.id).toBe('open_ticket_update')
    expect(buttons[1].reply.id).toBe('open_ticket_new')
    expect(buttons[0].reply.title.length).toBeLessThanOrEqual(20)
    expect(buttons[1].reply.title.length).toBeLessThanOrEqual(20)
  })
})
