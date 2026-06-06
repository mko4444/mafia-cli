// Pure domain types. No Ink, no React, no Anthropic — the engine depends on nothing app-specific.

export type Role = 'mafia' | 'doctor' | 'cop' | 'villager'
export type Faction = 'town' | 'mafia'
export type Phase = 'night' | 'day' | 'vote' | 'gameover'
export type PlayerId = string // 'p0'..'p6'

export const factionOf = (role: Role): Faction =>
  role === 'mafia' ? 'mafia' : 'town'

export interface Player {
  id: PlayerId
  name: string
  role: Role
  alive: boolean
  isHuman: boolean
}

// ── Public game log: the structured "memory of claims" fed to every agent ──
export type GameLogEvent =
  | { type: 'phase'; round: number; phase: Phase }
  | { type: 'statement'; round: number; speaker: PlayerId; text: string }
  | { type: 'vote'; round: number; voter: PlayerId; target: PlayerId | 'abstain' }
  | { type: 'death'; round: number; victim: PlayerId; cause: 'kill' | 'lynch'; revealedRole: Role }
  | { type: 'saved'; round: number } // doctor blocked the kill ("no one died")

export interface MafiaChannelMsg {
  speaker: PlayerId
  name: string
  text: string
}

export interface CopResult {
  round: number
  target: PlayerId
  faction: Faction
}

export interface GameState {
  players: Player[]
  phase: Phase
  round: number // night/day cycle, starts at 1
  log: GameLogEvent[] // public, append-only
  winner: Faction | null
  // per-round scratch — NEVER exposed raw to non-privileged views:
  mafiaChannel: MafiaChannelMsg[] // current night, mafia-private
  copResults: CopResult[] // cop-private
}

// ── Per-agent KNOWLEDGE VIEW: the ONLY thing an agent's prompt ever sees ──
export interface PublicPlayer {
  id: PlayerId
  name: string
}
export interface DeadPlayer extends PublicPlayer {
  revealedRole: Role
}

export interface KnowledgeView {
  you: { id: PlayerId; name: string; role: Role; faction: Faction }
  phase: Phase
  round: number
  alivePlayers: PublicPlayer[]
  deadPlayers: DeadPlayer[]
  publicLog: GameLogEvent[]
  // private knowledge, present ONLY when legitimately known:
  mafiaTeammates?: PublicPlayer[] // mafia only
  mafiaChannel?: MafiaChannelMsg[] // mafia only, during night
  investigations?: CopResult[] // cop only
}

// ── Structured agent decision: hidden reasoning + public action ──
export interface AgentDecision {
  reasoning: string // private chain-of-thought, never shown live
  suspicions: Record<PlayerId, number> // 0..1 per living player
  publicStatement: string // shown to the table (day) or mafia channel (night)
  action?: PlayerId // night target (kill / save / investigate)
  vote?: PlayerId | 'abstain' // vote phase only
  notes?: string // private strategy scratchpad, carried between turns (AI bots)
}

// ── Events the engine streams to the UI ──
export type GameEvent =
  | { kind: 'state'; state: GameState }
  | { kind: 'phaseStart'; phase: Phase; round: number }
  | { kind: 'thinking'; id: PlayerId; name: string } // an agent is deliberating
  | {
      kind: 'statement'
      id: PlayerId
      name: string
      text: string
      channel: 'day' | 'mafia'
    }
  | { kind: 'voteCast'; voter: PlayerId; voterName: string; target: PlayerId | 'abstain' }
  | { kind: 'death'; victim: PlayerId; name: string; cause: 'kill' | 'lynch'; role: Role }
  | { kind: 'noDeath'; round: number }
  | { kind: 'gameOver'; winner: Faction; reveal: ReasoningEntry[] }

// Post-game reveal: every hidden decision, in order.
export interface ReasoningEntry {
  round: number
  phase: Phase
  id: PlayerId
  name: string
  role: Role
  ask: string
  reasoning: string
  publicStatement: string
  action?: PlayerId
  vote?: PlayerId | 'abstain'
}
