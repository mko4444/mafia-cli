// Shared, pure view logic for both the local engine and the network client.
// `translate` maps one GameEvent into transcript items + pacing + end-state — no
// React, no sleeping, no sockets. The local source paces with `paceMs`; the
// network source ignores it (the server paces the broadcast for everyone).

import { PACING } from '~/config'
import type {
  AgentDecision,
  Faction,
  GameEvent,
  KnowledgeView,
  PlayerId,
  ReasoningEntry,
  Role,
} from '~/core/types'
import type { DecisionRequest } from '~/agents/PlayerAgent'

export interface FeedItem {
  id: number
  kind: 'banner' | 'say' | 'mafia' | 'vote' | 'death' | 'info' | 'win' | 'reveal'
  speaker?: string
  text: string
}

export interface Pending {
  view: KnowledgeView
  request: DecisionRequest
}

// A roster row both sources can produce (local from GameState, client from its view).
export interface RosterEntry {
  id: PlayerId
  name: string
  alive: boolean
  role?: Role // known only for the dead (revealed)
}

// The view-model both useGameEngine (local) and useNetworkGame (client) return.
export interface GameVM {
  feed: FeedItem[]
  thinking: string | null
  pending: Pending | null
  over: boolean
  winner: Faction | null
  reveal: ReasoningEntry[]
  myView: KnowledgeView | null // null until the first view arrives (network)
  roster: RosterEntry[]
  submit: (d: AgentDecision) => void
}

// Events that carry transcript content (everything except the raw-state event,
// which each source turns into a KnowledgeView/roster itself).
export type FeedEvent = Exclude<GameEvent, { kind: 'state' }>

export interface FeedCtx {
  humanId: PlayerId
  humanIsMafia: boolean
  spectator: boolean // eliminated viewer — may watch the secret mafia channel too
  nameOf: (id: PlayerId) => string
}

export interface Translated {
  feed: Omit<FeedItem, 'id'>[]
  thinking?: string | null // string=set, null=clear, undefined=leave as-is
  paceMs: number
  over?: { winner: Faction; reveal: ReasoningEntry[] }
}

const trim = (s: string) => (s.length > 200 ? s.slice(0, 197) + '…' : s)

export function rosterFromView(v: KnowledgeView): RosterEntry[] {
  // Roles are present only for spectators (eliminated players) and at game over.
  const roleOf = (id: PlayerId) => v.roles?.[id]
  return [
    ...v.alivePlayers.map((p) => ({ id: p.id, name: p.name, alive: true, role: roleOf(p.id) })),
    ...v.deadPlayers.map((p) => ({ id: p.id, name: p.name, alive: false, role: roleOf(p.id) })),
  ].sort((a, b) => a.id.localeCompare(b.id))
}

export function translate(ev: FeedEvent, ctx: FeedCtx): Translated {
  switch (ev.kind) {
    case 'phaseStart': {
      const label =
        ev.phase === 'night'
          ? `☾  Night ${ev.round}`
          : ev.phase === 'day'
            ? `☀  Day ${ev.round} — discussion`
            : `🗳  Day ${ev.round} — the vote`
      return { feed: [{ kind: 'banner', text: label }], paceMs: PACING.bannerMs }
    }
    case 'thinking':
      // Night actions are secret and we never show the human their own spinner.
      if (ev.id === ctx.humanId) return { feed: [], paceMs: 0 }
      return { feed: [], thinking: ev.name, paceMs: PACING.thinkMs }
    case 'statement':
      if (ev.channel === 'mafia') {
        // Living town never sees the mafia channel; mafia and spectators do.
        if (!ctx.humanIsMafia && !ctx.spectator) return { feed: [], thinking: null, paceMs: 0 }
        return {
          feed: [{ kind: 'mafia', speaker: ev.name, text: ev.text }],
          thinking: null,
          paceMs: PACING.lineMs,
        }
      }
      return {
        feed: [{ kind: 'say', speaker: ev.name, text: ev.text }],
        thinking: null,
        paceMs: PACING.lineMs,
      }
    case 'voteCast': {
      const t = ev.target === 'abstain' ? 'abstains' : `votes ${ctx.nameOf(ev.target)}`
      return { feed: [{ kind: 'vote', text: `${ev.voterName} ${t}` }], paceMs: PACING.lineMs }
    }
    case 'death':
      return {
        feed: [
          {
            kind: 'death',
            // Role stays hidden until the end-of-game reveal.
            text: `💀 ${ev.name} was ${ev.cause === 'lynch' ? 'lynched' : 'killed in the night'}.`,
          },
        ],
        thinking: null,
        paceMs: PACING.deathMs,
      }
    case 'noDeath':
      return { feed: [{ kind: 'info', text: '…no one died.' }], paceMs: PACING.lineMs }
    case 'gameOver': {
      const feed: Omit<FeedItem, 'id'>[] = [
        {
          kind: 'win',
          text:
            ev.winner === 'town'
              ? '🏆  TOWN WINS — every Mafia is dead.'
              : '🔪  MAFIA WINS — they reached parity.',
        },
        { kind: 'banner', text: 'The truth' },
      ]
      // Derive the role roster from the reveal (works without a full GameState).
      const seen = new Set<PlayerId>()
      for (const e of ev.reveal) {
        if (seen.has(e.id)) continue
        seen.add(e.id)
        feed.push({ kind: 'reveal', text: `${e.name} — ${e.role}` })
      }
      feed.push({ kind: 'banner', text: 'What they were really thinking' })
      for (const e of ev.reveal) {
        if (!e.reasoning || e.reasoning.startsWith('(')) continue
        const tag = `${e.phase[0].toUpperCase()}${e.round} ${e.ask}`
        feed.push({ kind: 'reveal', text: `[${tag}] ${e.name} (${e.role}): ${trim(e.reasoning)}` })
      }
      return { feed, thinking: null, paceMs: 0, over: { winner: ev.winner, reveal: ev.reveal } }
    }
  }
}
