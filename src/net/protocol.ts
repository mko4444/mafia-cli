// The wire contract, shared by server and client. Everything here is plain JSON.
//
// FIREWALL: there is deliberately NO message that carries a GameState. The only
// game data a client ever receives is its own KnowledgeView (`view`) and feed
// events the server has already vetted for that recipient — so a client cannot
// receive another player's secrets by construction.

import type { DecisionRequest } from '~/agents/PlayerAgent'
import type { AgentDecision, Faction, KnowledgeView, PlayerId, ReasoningEntry } from '~/core/types'
import type { FeedEvent } from '~/ui/feed'

export interface LobbyPlayer {
  name: string
  connected: boolean
}

export type ServerMsg =
  | { t: 'lobby'; players: LobbyPlayer[]; you: number; host: boolean; started: boolean }
  | { t: 'started'; you: PlayerId; name: string; token: string }
  | { t: 'view'; view: KnowledgeView }
  | { t: 'event'; ev: FeedEvent } // already filtered for this recipient
  | { t: 'decide'; reqId: number; view: KnowledgeView; request: DecisionRequest; deadlineMs: number }
  | { t: 'gameOver'; winner: Faction; reveal: ReasoningEntry[] }
  | { t: 'aborted'; reason: string }

export type ClientMsg =
  | { t: 'join'; name: string }
  | { t: 'rejoin'; token: string }
  | { t: 'start' } // host only
  | { t: 'decision'; reqId: number; decision: AgentDecision }

export const send = (ws: { send(d: string): void }, msg: ServerMsg | ClientMsg) =>
  ws.send(JSON.stringify(msg))
