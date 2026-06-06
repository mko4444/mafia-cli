import { describe, expect, it, vi } from 'vitest'
import { makeAiAgent } from '~/agents/aiAgent'
import type { LlmClient } from '~/agents/llmClient'
import { PERSONAS } from '~/agents/personas'
import { buildKnowledgeView } from '~/core/knowledge'
import { makeRng } from '~/core/rng'
import type { Role } from '~/core/types'
import { stateWithRoles } from './helpers'

const ROLES: Role[] = [
  'mafia',
  'mafia',
  'doctor',
  'cop',
  'villager',
  'villager',
  'villager',
]

const view = () => buildKnowledgeView(stateWithRoles(ROLES), 'p3') // the cop

describe('AiAgent', () => {
  it('returns the parsed decision from the LLM', async () => {
    const llm: LlmClient = {
      complete: vi.fn().mockResolvedValue({
        reasoning: 'p0 seems off',
        publicStatement: 'I’ll check p0',
        action: 'p0',
      }),
    }
    const agent = makeAiAgent('p3', PERSONAS[0], llm, makeRng(1))
    const d = await agent.decide(view(), { ask: 'copInvestigate' })
    expect(d.action).toBe('p0')
    expect(d.reasoning).toBe('p0 seems off')
  })

  it('retries then falls back deterministically when the LLM keeps failing', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('boom'))
    const agent = makeAiAgent('p3', PERSONAS[0], { complete }, makeRng(1))
    const d = await agent.decide(view(), { ask: 'copInvestigate' })
    expect(complete).toHaveBeenCalledTimes(3) // RETRIES
    expect(d.action).toBeDefined() // a legal-ish target was chosen
    expect(d.action).not.toBe('p3') // cop never investigates itself
    expect(d.reasoning).toContain('defaulted')
  })

  it('falls back to abstain for a malformed vote response', async () => {
    const llm: LlmClient = {
      complete: vi.fn().mockResolvedValue({ nonsense: true }),
    }
    const agent = makeAiAgent('p3', PERSONAS[0], llm, makeRng(1))
    const d = await agent.decide(view(), { ask: 'vote' })
    expect(d.vote).toBe('abstain')
  })
})
