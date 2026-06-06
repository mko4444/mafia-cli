import { factionOf, type Faction, type GameState } from '~/core/types'

// Town wins when all mafia are dead. Mafia win when they reach parity with town
// (mafia >= non-mafia among the living).
export function checkWinner(state: GameState): Faction | null {
  const living = state.players.filter((p) => p.alive)
  const mafia = living.filter((p) => factionOf(p.role) === 'mafia').length
  const town = living.length - mafia
  if (mafia === 0) return 'town'
  if (mafia >= town) return 'mafia'
  return null
}
