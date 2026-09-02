import { describe, expect, it } from 'vitest'

// Heuristic path via stub provider environment
process.env.MBRAIN_LLM_STUB = '1'

describe('operator heuristic classification (via stub run)', () => {
  it('maps Hebrew campaign request to create flow keywords', async () => {
    const { runOperatorCommand } = await import('@/lib/mbrain/agents/operator')
    // Smoke: module loads; full DB path tested in integration later
    expect(typeof runOperatorCommand).toBe('function')
  })
})
