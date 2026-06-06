import { describe, expect, it } from 'vitest'
import { legalTargets, resolveNight, tallyVotes } from '~/core/resolve'
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

describe('night resolution', () => {
  it('a kill lands when not saved', () => {
    const s = stateWithRoles(ROLES)
    expect(resolveNight(s, { kill: 'p4' })).toEqual({ victim: 'p4', role: 'villager' })
  })

  it('the doctor blocks the kill by saving the target', () => {
    const s = stateWithRoles(ROLES)
    expect(resolveNight(s, { kill: 'p4', save: 'p4' })).toEqual({})
  })

  it('no kill chosen means no death', () => {
    expect(resolveNight(stateWithRoles(ROLES), {})).toEqual({})
  })
})

describe('legal targets', () => {
  it('mafia cannot target their own', () => {
    const t = legalTargets(stateWithRoles(ROLES), '', 'mafiaKill')
    expect(t).not.toContain('p0')
    expect(t).not.toContain('p1')
    expect(t).toContain('p4')
  })

  it('the cop cannot investigate itself', () => {
    const t = legalTargets(stateWithRoles(ROLES), 'p3', 'copInvestigate')
    expect(t).not.toContain('p3')
  })

  it('the doctor may protect anyone alive, including self', () => {
    const t = legalTargets(stateWithRoles(ROLES), 'p2', 'doctorSave')
    expect(t).toContain('p2')
  })
})

describe('vote tally', () => {
  it('plurality lynches', () => {
    const r = tallyVotes(stateWithRoles(ROLES), { p0: 'p4', p1: 'p4', p2: 'p5' })
    expect(r.lynched).toBe('p4')
  })

  it('a tie means no lynch', () => {
    const r = tallyVotes(stateWithRoles(ROLES), { p0: 'p4', p1: 'p5' })
    expect(r.lynched).toBeUndefined()
  })

  it('all-abstain means no lynch', () => {
    const r = tallyVotes(stateWithRoles(ROLES), { p0: 'abstain', p1: 'abstain' })
    expect(r.lynched).toBeUndefined()
  })
})
