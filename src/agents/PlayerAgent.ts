import type { AgentDecision, KnowledgeView, PlayerId } from '~/core/types'

export type Ask =
  | 'mafiaKill'
  | 'doctorSave'
  | 'copInvestigate'
  | 'daySpeak'
  | 'vote'

export interface DecisionRequest {
  ask: Ask
}

// One interface for human and AI alike — the engine never branches on which.
export interface PlayerAgent {
  readonly id: PlayerId
  decide(view: KnowledgeView, request: DecisionRequest): Promise<AgentDecision>
}
