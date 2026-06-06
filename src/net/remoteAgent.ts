// A remote human as a PlayerAgent — the network sibling of makeHumanAgent. It
// ships the (firewalled) view to that player's socket and awaits their decision,
// falling back to a bot move on timeout or disconnect so one AFK player can never
// freeze the sequential engine.

import type { DecisionRequest, PlayerAgent } from '~/agents/PlayerAgent'
import type { AgentDecision, KnowledgeView, PlayerId } from '~/core/types'

export interface RemoteTransport {
  connected(seatId: PlayerId): boolean
  // Resolves with the player's decision, or null on timeout/disconnect.
  requestDecision(
    seatId: PlayerId,
    view: KnowledgeView,
    request: DecisionRequest,
    timeoutMs: number,
  ): Promise<AgentDecision | null>
}

export function makeRemoteAgent(
  id: PlayerId,
  transport: RemoteTransport,
  fallback: PlayerAgent,
  timeoutMs: number,
): PlayerAgent {
  return {
    id,
    async decide(view, request): Promise<AgentDecision> {
      if (!transport.connected(id)) return fallback.decide(view, request)
      const d = await transport.requestDecision(id, view, request, timeoutMs)
      return d ?? fallback.decide(view, request)
    },
  }
}
