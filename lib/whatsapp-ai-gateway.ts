/**
 * Vercel AI Gateway helpers for WhatsApp AI.
 * Auth: AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN (from `vercel env pull`).
 * No direct Anthropic / OpenAI SDK keys.
 */

import type { LanguageModel } from 'ai'

export type AiRoute = 'gateway' | 'none'

const DEFAULT_GATEWAY_MODEL = 'anthropic/claude-haiku-4.5'

export function hasAiGatewayAuth(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim()
  )
}

export function resolveAiRoute(): AiRoute {
  return hasAiGatewayAuth() ? 'gateway' : 'none'
}

function gatewayModelId(envOverride: string | undefined, fallback: string): string {
  const raw = envOverride?.trim()
  if (raw?.includes('/')) return raw
  return fallback
}

export function resolveWhatsAppAiModel(
  kind: 'rewrite' | 'intake' = 'rewrite'
): { model: LanguageModel; route: AiRoute; modelId: string } | null {
  if (!hasAiGatewayAuth()) return null
  const envKey =
    kind === 'intake'
      ? process.env.WHATSAPP_AI_INTAKE_MODEL || process.env.WHATSAPP_AI_MODEL
      : process.env.WHATSAPP_AI_MODEL
  const modelId = gatewayModelId(envKey, DEFAULT_GATEWAY_MODEL)
  return { model: modelId, route: 'gateway', modelId }
}
