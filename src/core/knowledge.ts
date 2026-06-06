// THE INFORMATION FIREWALL.
//
// Secrecy is enforced by *construction*, not by asking the model to keep secrets.
// buildKnowledgeView is the single chokepoint, and prompt-building accepts ONLY a
// KnowledgeView — there is no path from GameState to a prompt that bypasses this.
// Every projection below WHITELISTS fields; we never spread a full Player/GameState.

import {
  factionOf,
  type GameState,
  type KnowledgeView,
  type Player,
  type PlayerId,
  type PublicPlayer,
} from '~/core/types'
import { publicLog } from '~/core/log'

const pub = (p: Player): PublicPlayer => ({ id: p.id, name: p.name })

export function buildKnowledgeView(
  state: GameState,
  id: PlayerId,
): KnowledgeView {
  const me = state.players.find((p) => p.id === id)
  if (!me) throw new Error(`Unknown player ${id}`)

  const view: KnowledgeView = {
    you: { id: me.id, name: me.name, role: me.role, faction: factionOf(me.role) },
    phase: state.phase,
    round: state.round,
    alivePlayers: state.players.filter((p) => p.alive).map(pub),
    deadPlayers: state.players.filter((p) => !p.alive).map(pub), // names only — roles hidden until reveal
    publicLog: publicLog(state),
  }

  if (me.role === 'mafia') {
    view.mafiaTeammates = state.players
      .filter((p) => p.role === 'mafia' && p.id !== id)
      .map(pub)
    if (state.phase === 'night') view.mafiaChannel = state.mafiaChannel
  }

  // MVP has a single cop, so all cop results belong to it.
  if (me.role === 'cop') view.investigations = state.copResults

  // Eliminated players become spectators: they may watch passively and see every
  // role. Living players never get this — the firewall only opens once you're out.
  if (!me.alive) {
    view.spectator = true
    view.roles = Object.fromEntries(state.players.map((p) => [p.id, p.role]))
  }

  // doctor & villager (alive) get no private knowledge.
  return view
}
