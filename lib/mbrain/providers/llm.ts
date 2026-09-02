/**
 * LLM provider abstraction — cost-first; default local OpenAI-compatible.
 */
import { z } from 'zod'

export const llmMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})

export type LlmMessage = z.infer<typeof llmMessageSchema>

export type LlmCompletionRequest = {
  messages: LlmMessage[]
  model?: string
  temperature?: number
  responseFormatJson?: boolean
  maxTokens?: number
}

export type LlmCompletionResult = {
  content: string
  provider: string
  model: string
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd: number
}

export interface LLMProvider {
  readonly id: string
  complete(req: LlmCompletionRequest): Promise<LlmCompletionResult>
}

type OpenAiCompatConfig = {
  id: string
  baseUrl: string
  apiKey: string
  defaultModel: string
  estimatedInputPer1kUsd: number
  estimatedOutputPer1kUsd: number
}

async function openAiCompatibleComplete(
  cfg: OpenAiCompatConfig,
  req: LlmCompletionRequest
): Promise<LlmCompletionResult> {
  const model = req.model ?? cfg.defaultModel
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`
  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    temperature: req.temperature ?? 0.4,
  }
  if (req.maxTokens != null) body.max_tokens = req.maxTokens
  if (req.responseFormatJson) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM provider ${cfg.id} failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const content = json.choices?.[0]?.message?.content ?? ''
  const inputTokens = json.usage?.prompt_tokens
  const outputTokens = json.usage?.completion_tokens
  const estimatedCostUsd =
    ((inputTokens ?? 0) / 1000) * cfg.estimatedInputPer1kUsd +
    ((outputTokens ?? 0) / 1000) * cfg.estimatedOutputPer1kUsd

  return {
    content,
    provider: cfg.id,
    model,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
  }
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string
  private cfg: OpenAiCompatConfig

  constructor(cfg: OpenAiCompatConfig) {
    this.id = cfg.id
    this.cfg = cfg
  }

  complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    return openAiCompatibleComplete(this.cfg, req)
  }
}

/** Deterministic stub for tests / no-credential environments. */
export class StubLLMProvider implements LLMProvider {
  readonly id = 'stub'

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const last = req.messages[req.messages.length - 1]?.content ?? ''
    return {
      content: JSON.stringify({
        stub: true,
        echo: last.slice(0, 200),
        note: 'StubLLMProvider — configure LOCAL_AI_BASE_URL for real inference',
      }),
      provider: this.id,
      model: 'stub',
      estimatedCostUsd: 0,
    }
  }
}

export function getLLMProvider(): LLMProvider {
  const provider = (process.env.AI_PROVIDER ?? 'local').toLowerCase()

  if (provider === 'stub' || process.env.MBRAIN_LLM_STUB === '1') {
    return new StubLLMProvider()
  }

  if (provider === 'local' || provider === 'openai_compatible') {
    const baseUrl = process.env.LOCAL_AI_BASE_URL ?? 'http://127.0.0.1:11434/v1'
    const model = process.env.LOCAL_AI_MODEL ?? 'llama3.1'
    const apiKey = process.env.LOCAL_AI_API_KEY ?? 'ollama'
    return new OpenAICompatibleProvider({
      id: provider,
      baseUrl,
      apiKey,
      defaultModel: model,
      estimatedInputPer1kUsd: 0,
      estimatedOutputPer1kUsd: 0,
    })
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY required when AI_PROVIDER=openai')
    return new OpenAICompatibleProvider({
      id: 'openai',
      baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKey,
      defaultModel: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      estimatedInputPer1kUsd: 0.00015,
      estimatedOutputPer1kUsd: 0.0006,
    })
  }

  // Gemini via OpenAI-compatible gateways can be wired later; fail clearly.
  throw new Error(`Unsupported AI_PROVIDER=${provider}. Use local|openai_compatible|openai|stub`)
}
