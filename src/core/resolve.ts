// Night resolution, vote tallying, and the single source of truth for legal targets.

import type { GameState, Player, PlayerId, Role } from '~/core/types'

export const alive = (state: GameState): Player[] =>
  state.players.filter((p) => p.alive)

export const byId = (state: GameState, id: PlayerId): Player | undefined =>
  state.players.find((p) => p.id === id)

// Legal targets for a given night action. Kept here so AI clamping and the human
// UI share one definition.
export function legalTargets(
  state: GameState,
  actorId: PlayerId,
  ask: 'mafiaKill' | 'doctorSave' | 'copInvestigate',
): PlayerId[] {
  const living = alive(state)
  switch (ask) {
    case 'mafiaKill':
      // mafia don't kill their own
      return living.filter((p) => p.role !== 'mafia').map((p) => p.id)
    case 'doctorSave':
      // doctor may protect anyone alive, including self
      return living.map((p) => p.id)
    case 'copInvestigate':
      // cop investigates anyone else alive
      return living.filter((p) => p.id !== actorId).map((p) => p.id)
  }
}

export interface NightActions {
  kill?: PlayerId
  save?: PlayerId
}

export interface NightOutcome {
  victim?: PlayerId // undefined when the kill was saved or no kill chosen
  role?: Role
}

export function resolveNight(
  state: GameState,
  actions: NightActions,
): NightOutcome {
  if (!actions.kill) return {}
  if (actions.kill === actions.save) return {} // doctor blocked it
  const victim = byId(state, actions.kill)
  if (!victim || !victim.alive) return {}
  return { victim: victim.id, role: victim.role }
}

export interface VoteOutcome {
  lynched?: PlayerId // undefined on a tie or all-abstain
  role?: Role
  tally: Record<string, number>
}

// Plurality lynch. A tie (including all-abstain) means no lynch — deterministic.
export function tallyVotes(
  state: GameState,
  votes: Record<PlayerId, PlayerId | 'abstain'>,
): VoteOutcome {
  const tally: Record<string, number> = {}
  for (const target of Object.values(votes)) {
    if (target === 'abstain') continue
    tally[target] = (tally[target] ?? 0) + 1
  }
  let top: PlayerId | undefined
  let topN = 0
  let tied = false
  for (const [target, n] of Object.entries(tally)) {
    if (n > topN) {
      top = target
      topN = n
      tied = false
    } else if (n === topN) {
      tied = true
    }
  }
  if (!top || tied) return { tally }
  const p = byId(state, top)
  return { lynched: top, role: p?.role, tally }
}
