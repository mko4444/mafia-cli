// An AI-controlled player: KnowledgeView + persona + running strategy notes ->
// adaptive-thinking LLM decision. Guarantees a well-formed AgentDecision (retry,
// then a real in-character fallback) so a parse/refusal failure can never crash or
// silence the bot. Target legality is the engine's job (it clamps).

import type { DecisionRequest, PlayerAgent } from '~/agents/PlayerAgent'
import type { LlmClient } from '~/agents/llmClient'
import type { Persona } from '~/agents/personas'
import { mockStatement } from '~/agents/mockAgent'
import { allowedTargets, buildSystemPrompt, buildUserPrompt } from '~/agents/prompt'
import { decisionFormat, parseDecision } from '~/agents/schema'
import { pick, type Rng } from '~/core/rng'
import type { AgentDecision, KnowledgeView, PlayerId } from '~/core/types'

const RETRIES = 3

export function makeAiAgent(
  id: PlayerId,
  persona: Persona,
  llm: LlmClient,
  rng: Rng,
): PlayerAgent {
  // Private scratchpad carried across turns so the bot's deception stays
  // consistent (tracked lies, framing targets, coalition plans, vote math).
  let memory = ''
  return {
    id,
    async decide(view, request): Promise<AgentDecision> {
      const format = decisionFormat(request.ask)
      const system = buildSystemPrompt(view.you.role, persona)
      const user = buildUserPrompt(view, request.ask, memory)
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        try {
          const decision = parseDecision(await llm.complete({ system, user, format }))
          if (decision.notes) memory = decision.notes
          return decision
        } catch (err) {
          // Surface the real cause (rate limit, parse, refusal) instead of hiding it.
          console.error(`[ai ${id}] decide failed (attempt ${attempt + 1}):`, err)
        }
      }
      return fallback(view, request, rng)
    },
  }
}

// Never "..." — a failed bot still says a plausible in-character line and makes a
// legal, neutral move.
function fallback(
  view: KnowledgeView,
  request: DecisionRequest,
  rng: Rng,
): AgentDecision {
  const targets = allowedTargets(view, request.ask)
  return {
    reasoning: '(no response — defaulted)',
    suspicions: {},
    publicStatement: mockStatement(view, request.ask, rng),
    action: targets.length ? pick(targets, rng) : undefined,
    vote: request.ask === 'vote' ? 'abstain' : undefined,
  }
}
