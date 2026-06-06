import type { Player, Role } from '~/core/types'
import { shuffle, type Rng } from '~/core/rng'

// Balanced 7-player setup. Index 0 of the role multiset is irrelevant — we shuffle.
export const DEFAULT_ROLES: Role[] = [
  'mafia',
  'mafia',
  'doctor',
  'cop',
  'villager',
  'villager',
  'villager',
]

export interface Seat {
  name: string
  isHuman: boolean
}

// Assign roles to seats. If humanRole is given, the human is guaranteed that role
// and the rest are dealt randomly; otherwise everything is shuffled.
export function assignRoles(
  seats: Seat[],
  rng: Rng,
  roles: Role[] = DEFAULT_ROLES,
  humanRole?: Role,
): Player[] {
  if (seats.length !== roles.length) {
    throw new Error(`Need ${roles.length} seats, got ${seats.length}`)
  }
  const humanIdx = seats.findIndex((s) => s.isHuman)
  let deal = shuffle(roles, rng)

  if (humanRole && humanIdx >= 0) {
    const take = deal.indexOf(humanRole)
    if (take < 0) throw new Error(`Role ${humanRole} not in this setup`)
    // Put the human's chosen role at the human's seat, deal the rest in order.
    const rest = deal.filter((_, i) => i !== take)
    deal = seats.map((s) => (s.isHuman ? humanRole : (rest.shift() as Role)))
  }

  return seats.map((s, i) => ({
    id: `p${i}`,
    name: s.name,
    role: deal[i],
    alive: true,
    isHuman: s.isHuman,
  }))
}
