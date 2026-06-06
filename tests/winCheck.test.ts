import { describe, expect, it } from 'vitest'
import { checkWinner } from '~/core/winCheck'
import type { Role } from '~/core/types'
import { stateWithRoles } from './helpers'

const ROLES: Role[] = [
  'mafia',
  'mafia',
  'doctor',
  'cop',
  'villager',
  'villager',
  'villager',
]

describe('win conditions', () => {
  it('no winner at the start', () => {
    expect(checkWinner(stateWithRoles(ROLES))).toBeNull()
  })

  it('town wins when all mafia are dead', () => {
    const s = stateWithRoles(ROLES)
    s.players[0].alive = false
    s.players[1].alive = false
    expect(checkWinner(s)).toBe('town')
  })

  it('mafia win at parity', () => {
    const s = stateWithRoles(ROLES)
    // kill until 2 mafia vs 2 town -> parity
    for (const id of ['p2', 'p3', 'p4']) s.players.find((p) => p.id === id)!.alive = false
    // living: p0,p1 (mafia), p5,p6 (town) -> 2 vs 2 -> mafia win
    expect(checkWinner(s)).toBe('mafia')
  })
})
