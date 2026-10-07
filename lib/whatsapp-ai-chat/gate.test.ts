import { afterEach, describe, expect, it } from 'vitest'
import { isClientWhatsAppAiChatEnabled, isWhatsAppAiChatMasterEnabled } from '@/lib/whatsapp-ai-chat/gate'

const ORIGINAL = process.env.WHATSAPP_AI_CHAT_ENABLED

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.WHATSAPP_AI_CHAT_ENABLED
  else process.env.WHATSAPP_AI_CHAT_ENABLED = ORIGINAL
})

describe('whatsapp ai chat gate', () => {
  it('stays off when the master env is unset, without reading the database', async () => {
    delete process.env.WHATSAPP_AI_CHAT_ENABLED
    expect(isWhatsAppAiChatMasterEnabled()).toBe(false)

    let queried = false
    const admin = {
      from() {
        queried = true
        return this
      },
    }
    const enabled = await isClientWhatsAppAiChatEnabled(admin as never, 'client-1')
    expect(enabled).toBe(false)
    expect(queried).toBe(false)
  })

  it('stays off when the client row is missing or the read fails', async () => {
    process.env.WHATSAPP_AI_CHAT_ENABLED = 'true'
    const missing = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }
      },
    }
    expect(await isClientWhatsAppAiChatEnabled(missing as never, 'client-1')).toBe(false)

    const failed = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: 'relation does not exist' } }),
            }),
          }),
        }
      },
    }
    expect(await isClientWhatsAppAiChatEnabled(failed as never, 'client-1')).toBe(false)
  })

  it('turns on only for an enabled client row', async () => {
    process.env.WHATSAPP_AI_CHAT_ENABLED = 'true'
    const admin = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { enabled: true }, error: null }),
            }),
          }),
        }
      },
    }
    expect(await isClientWhatsAppAiChatEnabled(admin as never, 'client-1')).toBe(true)
  })
})
