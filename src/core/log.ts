import type { GameLogEvent, GameState } from '~/core/types'

export function append(state: GameState, event: GameLogEvent): void {
  state.log.push(event)
}

// The public log holds only public events by construction; this is the explicit
// projection an agent's view is allowed to see.
export function publicLog(state: GameState): GameLogEvent[] {
  return state.log
}
