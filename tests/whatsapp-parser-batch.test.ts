import { describe, expect, it } from 'vitest'
import { parseAllIncomingWhatsAppMessages, parseIncomingWhatsAppMessage } from '@/lib/whatsapp-parser'

describe('whatsapp parser batch (audit #14)', () => {
  it('returns every message across entries/changes', () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pn1' },
                messages: [
                  { id: 'm1', from: '972501111111', type: 'text', text: { body: 'אחת' } },
                  { id: 'm2', from: '972502222222', type: 'text', text: { body: 'שתיים' } },
                ],
              },
            },
          ],
        },
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pn1' },
                messages: [{ id: 'm3', from: '972503333333', type: 'text', text: { body: 'שלוש' } }],
              },
            },
          ],
        },
      ],
    }

    const all = parseAllIncomingWhatsAppMessages(body)
    expect(all.map((m) => m.messageId)).toEqual(['m1', 'm2', 'm3'])
    expect(parseIncomingWhatsAppMessage(body)?.messageId).toBe('m1')
  })

  it('attaches the WhatsApp profile name of the sender only', () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [
                  { wa_id: '972543261291', profile: { name: '  יוני לוי  ' } },
                  { wa_id: '972501111111', profile: { name: 'אחר' } },
                ],
                messages: [{ id: 'm1', from: '972543261291', type: 'text', text: { body: 'שלום' } }],
              },
            },
          ],
        },
      ],
    }

    expect(parseIncomingWhatsAppMessage(body)?.profileName).toBe('יוני לוי')
  })

  it('drops a profile name that is not a person name', () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '972543261291', profile: { name: '0543261291' } }],
                messages: [{ id: 'm1', from: '+972543261291', type: 'text', text: { body: 'שלום' } }],
              },
            },
          ],
        },
      ],
    }

    expect(parseIncomingWhatsAppMessage(body)?.profileName).toBeUndefined()
  })
})
