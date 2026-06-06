import type { PlayerAgent } from '~/agents/PlayerAgent'
import type { AgentDecision, KnowledgeView, PlayerId } from '~/core/types'
import type { DecisionRequest } from '~/agents/PlayerAgent'

// The human is just another PlayerAgent. `awaitInput` is supplied by the UI: it
// renders the right control and resolves when the human submits — so the engine
// blocks on the human exactly as it blocks on an LLM call.
export type AwaitInput = (
  view: KnowledgeView,
  request: DecisionRequest,
) => Promise<AgentDecision>

export function makeHumanAgent(id: PlayerId, awaitInput: AwaitInput): PlayerAgent {
  return { id, decide: awaitInput }
}
