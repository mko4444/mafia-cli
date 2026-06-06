// The pure game loop: an async generator that yields GameEvents and awaits every
// decision through the uniform PlayerAgent interface. No Ink, no Anthropic, no
// pacing — pacing lives in the view. Strip the view and this still plays a full,
// correct game instantly (which is exactly what engine.test.ts does).

import type { Ask, DecisionRequest, PlayerAgent } from '~/agents/PlayerAgent'
import { DAY_ROUNDS } from '~/config'
import { buildKnowledgeView } from '~/core/knowledge'
import { append } from '~/core/log'
import { pick, type Rng } from '~/core/rng'
import { alive, byId, legalTargets, resolveNight, tallyVotes } from '~/core/resolve'
import {
  factionOf,
  type AgentDecision,
  type GameEvent,
  type GameState,
  type Player,
  type PlayerId,
  type ReasoningEntry,
} from '~/core/types'
import { checkWinner } from '~/core/winCheck'

export interface EngineDeps {
  agents: Record<PlayerId, PlayerAgent>
  rng: Rng
  mafiaRounds?: number // discussion passes in the mafia night channel (default 1)
  dayRounds?: number // discussion passes during the day (default 1)
}

const clampTarget = (want: PlayerId | undefined, legal: PlayerId[], rng: Rng) =>
  want && legal.includes(want) ? want : pick(legal, rng)

const clampVote = (want: PlayerId | 'abstain' | undefined, legal: PlayerId[]) =>
  want === 'abstain' || (want && legal.includes(want)) ? want : 'abstain'

export async function* runGame(
  state: GameState,
  deps: EngineDeps,
): AsyncGenerator<GameEvent> {
  const { agents, rng } = deps
  const mafiaRounds = deps.mafiaRounds ?? 1
  const dayRounds = deps.dayRounds ?? DAY_ROUNDS
  const reveal: ReasoningEntry[] = []

  const record = (p: Player, ask: Ask, d: AgentDecision) =>
    reveal.push({
      round: state.round,
      phase: state.phase,
      id: p.id,
      name: p.name,
      role: p.role,
      ask,
      reasoning: d.reasoning,
      publicStatement: d.publicStatement,
      action: d.action,
      vote: d.vote,
    })

  async function* ask(p: Player, request: DecisionRequest) {
    yield { kind: 'thinking', id: p.id, name: p.name } as GameEvent
    const view = buildKnowledgeView(state, p.id)
    const decision = await agents[p.id].decide(view, request)
    record(p, request.ask, decision)
    return decision
  }

  while (!state.winner) {
    // ─────────────────────────── NIGHT ───────────────────────────
    state.phase = 'night'
    state.mafiaChannel = []
    append(state, { type: 'phase', round: state.round, phase: 'night' })
    yield { kind: 'phaseStart', phase: 'night', round: state.round }
    yield { kind: 'state', state }

    // Mafia coordinate in their private channel, then the kill is the majority
    // of the final round's proposals.
    let killProposals: (PlayerId | undefined)[] = []
    for (let r = 0; r < mafiaRounds; r++) {
      killProposals = []
      for (const m of alive(state).filter((p) => p.role === 'mafia')) {
        const d = yield* ask(m, { ask: 'mafiaKill' })
        state.mafiaChannel.push({ speaker: m.id, name: m.name, text: d.publicStatement })
        yield {
          kind: 'statement',
          id: m.id,
          name: m.name,
          text: d.publicStatement,
          channel: 'mafia',
        }
        killProposals.push(d.action)
      }
    }
    // mafiaKill ignores the actor (mafia simply can't target their own).
    const kill = decideKill(killProposals, legalTargets(state, '', 'mafiaKill'), rng)

    // Doctor protects, cop investigates (private; never surfaced publicly).
    let save: PlayerId | undefined
    const doctor = alive(state).find((p) => p.role === 'doctor')
    if (doctor) {
      const d = yield* ask(doctor, { ask: 'doctorSave' })
      save = clampTarget(d.action, legalTargets(state, doctor.id, 'doctorSave'), rng)
    }
    const cop = alive(state).find((p) => p.role === 'cop')
    if (cop) {
      const d = yield* ask(cop, { ask: 'copInvestigate' })
      const target = clampTarget(
        d.action,
        legalTargets(state, cop.id, 'copInvestigate'),
        rng,
      )
      state.copResults.push({
        round: state.round,
        target,
        faction: factionOf(byId(state, target)!.role),
      })
    }

    const outcome = resolveNight(state, { kill, save })
    if (outcome.victim) {
      kills(state, outcome.victim)
      append(state, {
        type: 'death',
        round: state.round,
        victim: outcome.victim,
        cause: 'kill',
      })
      yield {
        kind: 'death',
        victim: outcome.victim,
        name: byId(state, outcome.victim)!.name,
        cause: 'kill',
      }
    } else {
      append(state, { type: 'saved', round: state.round })
      yield { kind: 'noDeath', round: state.round }
    }
    yield { kind: 'state', state }
    if ((state.winner = checkWinner(state))) break

    // ──────────────────────────── DAY ────────────────────────────
    state.phase = 'day'
    append(state, { type: 'phase', round: state.round, phase: 'day' })
    yield { kind: 'phaseStart', phase: 'day', round: state.round }
    yield { kind: 'state', state }
    for (let r = 0; r < dayRounds; r++) {
      for (const p of alive(state)) {
        const d = yield* ask(p, { ask: 'daySpeak' })
        append(state, {
          type: 'statement',
          round: state.round,
          speaker: p.id,
          text: d.publicStatement,
        })
        yield {
          kind: 'statement',
          id: p.id,
          name: p.name,
          text: d.publicStatement,
          channel: 'day',
        }
      }
    }

    // ──────────────────────────── VOTE ───────────────────────────
    state.phase = 'vote'
    append(state, { type: 'phase', round: state.round, phase: 'vote' })
    yield { kind: 'phaseStart', phase: 'vote', round: state.round }
    yield { kind: 'state', state }
    const livingIds = alive(state).map((p) => p.id)
    const votes: Record<PlayerId, PlayerId | 'abstain'> = {}
    for (const p of alive(state)) {
      const d = yield* ask(p, { ask: 'vote' })
      const v = clampVote(d.vote, livingIds)
      votes[p.id] = v
      append(state, { type: 'vote', round: state.round, voter: p.id, target: v })
      yield { kind: 'voteCast', voter: p.id, voterName: p.name, target: v }
    }
    const vo = tallyVotes(state, votes)
    if (vo.lynched) {
      kills(state, vo.lynched)
      append(state, {
        type: 'death',
        round: state.round,
        victim: vo.lynched,
        cause: 'lynch',
      })
      yield {
        kind: 'death',
        victim: vo.lynched,
        name: byId(state, vo.lynched)!.name,
        cause: 'lynch',
      }
    } else {
      yield { kind: 'noDeath', round: state.round }
    }
    yield { kind: 'state', state }
    if ((state.winner = checkWinner(state))) break

    state.round++
  }

  state.phase = 'gameover'
  yield { kind: 'gameOver', winner: state.winner!, reveal }
}

function kills(state: GameState, id: PlayerId): void {
  const p = byId(state, id)
  if (p) p.alive = false
}

// Final kill = majority of the mafia's last-round proposals; tie broken by rng.
function decideKill(
  proposals: (PlayerId | undefined)[],
  legal: PlayerId[],
  rng: Rng,
): PlayerId {
  const valid = proposals.filter(
    (a): a is PlayerId => a !== undefined && legal.includes(a),
  )
  if (valid.length === 0) return pick(legal, rng)
  const counts: Record<string, number> = {}
  for (const a of valid) counts[a] = (counts[a] ?? 0) + 1
  const max = Math.max(...Object.values(counts))
  const top = Object.keys(counts).filter((k) => counts[k] === max)
  return top.length === 1 ? top[0] : pick(top, rng)
}
