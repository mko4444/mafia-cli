import type { PlayerAgent } from '~/agents/PlayerAgent'
import type { AgentDecision, GameState, Player, PlayerId, Role } from '~/core/types'

// Build a deterministic state with exact roles (no shuffle), all AI, all alive.
export function stateWithRoles(roles: Role[]): GameState {
  const players: Player[] = roles.map((role, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    role,
    alive: true,
    isHuman: false,
  }))
  return {
    players,
    phase: 'night',
    round: 1,
    log: [],
    winner: null,
    mafiaChannel: [],
    copResults: [],
  }
}

// Test doubles that read the live state (truth) — we're exercising the engine
// loop, not agent intelligence, so omniscience is fine here.
export function omniscientAgents(
  state: GameState,
): Record<PlayerId, PlayerAgent> {
  const make = (id: PlayerId): PlayerAgent => ({
    id,
    async decide(_view, req): Promise<AgentDecision> {
      const living = state.players.filter((p) => p.alive)
      const base = { reasoning: '', suspicions: {}, publicStatement: `${id} acts` }
      switch (req.ask) {
        case 'mafiaKill':
          return { ...base, action: living.find((p) => p.role !== 'mafia')!.id }
        case 'doctorSave':
          return { ...base, action: living[living.length - 1].id }
        case 'copInvestigate':
          return { ...base, action: living.find((p) => p.id !== id)!.id }
        case 'daySpeak':
          return base
        case 'vote': {
          const m = living.find((p) => p.role === 'mafia')
          return { ...base, vote: m ? m.id : 'abstain' }
        }
      }
    },
  })
  return Object.fromEntries(state.players.map((p) => [p.id, make(p.id)]))
}
