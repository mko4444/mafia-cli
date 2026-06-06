import { describe, expect, it } from 'vitest'
import { runGame } from '~/core/engine'
import { makeRng } from '~/core/rng'
import { factionOf, type GameEvent, type Role } from '~/core/types'
import { omniscientAgents, stateWithRoles } from './helpers'

const ROLES: Role[] = [
  'mafia',
  'mafia',
  'doctor',
  'cop',
  'villager',
  'villager',
  'villager',
]

async function play() {
  const state = stateWithRoles(ROLES)
  const events: GameEvent[] = []
  for await (const ev of runGame(state, {
    agents: omniscientAgents(state),
    rng: makeRng(1),
  })) {
    events.push(ev)
  }
  return { state, events }
}

describe('engine — full game with mock agents (zero API calls)', () => {
  it('runs to completion and town wins (everyone lynches the mafia)', async () => {
    const { state, events } = await play()
    expect(state.phase).toBe('gameover')
    expect(state.winner).toBe('town')
    expect(state.players.filter((p) => factionOf(p.role) === 'mafia' && p.alive)).toHaveLength(0)
    const over = events.at(-1)
    expect(over?.kind).toBe('gameOver')
    if (over?.kind === 'gameOver') expect(over.reveal.length).toBeGreaterThan(0)
  })

  it('is deterministic across runs', async () => {
    const a = await play()
    const b = await play()
    expect(a.state.winner).toBe(b.state.winner)
    expect(a.events.length).toBe(b.events.length)
  })

  it('never asks a dead player to act', async () => {
    const state = stateWithRoles(ROLES)
    const agents = omniscientAgents(state)
    const asked: string[] = []
    for (const id of Object.keys(agents)) {
      const inner = agents[id].decide.bind(agents[id])
      agents[id] = {
        id,
        decide: (v, r) => {
          expect(state.players.find((p) => p.id === id)!.alive).toBe(true)
          asked.push(id)
          return inner(v, r)
        },
      }
    }
    for await (const _ of runGame(state, { agents, rng: makeRng(1) })) void _
    expect(asked.length).toBeGreaterThan(0)
  })
})
