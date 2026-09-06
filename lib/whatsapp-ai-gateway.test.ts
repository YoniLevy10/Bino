import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  hasAiGatewayAuth,
  resolveAiRoute,
  resolveWhatsAppAiModel,
} from '@/lib/whatsapp-ai-gateway'
import { isWhatsAppAiEnabled } from '@/lib/whatsapp-ai'

describe('whatsapp-ai-gateway', () => {
  const prev = {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
    WHATSAPP_AI_ENABLED: process.env.WHATSAPP_AI_ENABLED,
    WHATSAPP_AI_MODEL: process.env.WHATSAPP_AI_MODEL,
  }

  beforeEach(() => {
    delete process.env.AI_GATEWAY_API_KEY
    delete process.env.VERCEL_OIDC_TOKEN
    delete process.env.WHATSAPP_AI_ENABLED
    delete process.env.WHATSAPP_AI_MODEL
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('requires gateway auth', () => {
    expect(hasAiGatewayAuth()).toBe(false)
    expect(resolveAiRoute()).toBe('none')
    expect(resolveWhatsAppAiModel()).toBeNull()
  })

  it('accepts AI_GATEWAY_API_KEY', () => {
    process.env.AI_GATEWAY_API_KEY = 'gw'
    expect(hasAiGatewayAuth()).toBe(true)
    expect(resolveAiRoute()).toBe('gateway')
    expect(resolveWhatsAppAiModel()?.modelId).toBe('anthropic/claude-haiku-4.5')
  })

  it('accepts VERCEL_OIDC_TOKEN', () => {
    process.env.VERCEL_OIDC_TOKEN = 'oidc'
    expect(hasAiGatewayAuth()).toBe(true)
  })

  it('isWhatsAppAiEnabled needs flag + gateway', () => {
    process.env.WHATSAPP_AI_ENABLED = 'true'
    expect(isWhatsAppAiEnabled()).toBe(false)
    process.env.AI_GATEWAY_API_KEY = 'gw'
    expect(isWhatsAppAiEnabled()).toBe(true)
  })

  it('allows model slug override', () => {
    process.env.AI_GATEWAY_API_KEY = 'gw'
    process.env.WHATSAPP_AI_MODEL = 'anthropic/claude-sonnet-4.5'
    expect(resolveWhatsAppAiModel()?.modelId).toBe('anthropic/claude-sonnet-4.5')
  })
})
