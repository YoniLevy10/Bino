import { describe, expect, it } from 'vitest'
import {
  isManagerOutreachAckReply,
  managerOutreachAckInboundBody,
  MANAGER_OUTREACH_ACK_BUTTON_TEXT,
  MANAGER_OUTREACH_ACK_DISPLAY_BODY,
} from '@/lib/whatsapp/whatsapp-manager-outreach'
import { managerReplyTemplateParams } from '@/lib/whatsapp/whatsapp-inbox-context'
import { parseIncomingWhatsAppMessage } from '@/lib/whatsapp/whatsapp-parser'

describe('manager outreach ack + compose params', () => {
  it('maps compose text into manager_reply {{1}}/{{2}} without retyping', () => {
    const params = managerReplyTemplateParams(
      {
        resident_name: 'דנה',
        building_name: null,
        open_ticket: null,
        recent_closed_ticket: null,
      },
      '  שלום, נשמח לתאם ביקור מחר  '
    )
    expect(params).toEqual(['דנה', 'שלום, נשמח לתאם ביקור מחר'])
  })

  it('detects QUICK_REPLY by title or id', () => {
    expect(isManagerOutreachAckReply(MANAGER_OUTREACH_ACK_BUTTON_TEXT, null)).toBe(true)
    expect(isManagerOutreachAckReply('x', MANAGER_OUTREACH_ACK_BUTTON_TEXT)).toBe(true)
    expect(isManagerOutreachAckReply('mgr_ack', null)).toBe(true)
    expect(isManagerOutreachAckReply('proj_0', 'בחר בניין')).toBe(false)
  })

  it('formats inbound display body for ack', () => {
    expect(managerOutreachAckInboundBody('קיבלתי', 'קיבלתי')).toBe(
      MANAGER_OUTREACH_ACK_DISPLAY_BODY
    )
    expect(managerOutreachAckInboundBody('proj_1', 'בניין')).toBeNull()
  })

  it('parses interactive button_reply for ack title', () => {
    const parsed = parseIncomingWhatsAppMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '972501234567',
                    id: 'wamid.ACK1',
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: { id: 'קיבלתי', title: 'קיבלתי' },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    })
    expect(parsed?.interactiveReplyTitle).toBe('קיבלתי')
    expect(isManagerOutreachAckReply(parsed?.interactiveReplyId, parsed?.interactiveReplyTitle)).toBe(
      true
    )
  })

  it('parses legacy type=button template reply', () => {
    const parsed = parseIncomingWhatsAppMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '972501234567',
                    id: 'wamid.ACK2',
                    type: 'button',
                    button: { payload: 'קיבלתי', text: 'קיבלתי' },
                  },
                ],
              },
            },
          ],
        },
      ],
    })
    expect(parsed?.messageType).toBe('button')
    expect(parsed?.interactiveReplyTitle).toBe('קיבלתי')
    expect(isManagerOutreachAckReply(parsed?.interactiveReplyId, parsed?.interactiveReplyTitle)).toBe(
      true
    )
  })
})
