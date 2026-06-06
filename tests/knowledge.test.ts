import { describe, expect, it } from 'vitest'
import { buildKnowledgeView } from '~/core/knowledge'
import type { Role } from '~/core/types'
import { stateWithRoles } from './helpers'

// p0,p1 mafia · p2 doctor · p3 cop · p4,p5,p6 villager
const ROLES: Role[] = [
  'mafia',
  'mafia',
  'doctor',
  'cop',
  'villager',
  'villager',
  'villager',
]

describe('information firewall', () => {
  it('a villager learns no private knowledge', () => {
    const v = buildKnowledgeView(stateWithRoles(ROLES), 'p4')
    expect(v.mafiaTeammates).toBeUndefined()
    expect(v.mafiaChannel).toBeUndefined()
    expect(v.investigations).toBeUndefined()
  })

  it('a non-mafia view never contains another player’s role', () => {
    const v = buildKnowledgeView(stateWithRoles(ROLES), 'p4')
    const json = JSON.stringify(v)
    // only the viewer's own role may appear
    expect(json).toContain('"role":"villager"')
    expect(json).not.toContain('"role":"mafia"')
    expect(json).not.toContain('"role":"cop"')
    expect(json).not.toContain('"role":"doctor"')
  })

  it('mafia see each other but villagers do not', () => {
    const m0 = buildKnowledgeView(stateWithRoles(ROLES), 'p0')
    expect(m0.mafiaTeammates?.map((t) => t.id)).toEqual(['p1'])
    const m1 = buildKnowledgeView(stateWithRoles(ROLES), 'p1')
    expect(m1.mafiaTeammates?.map((t) => t.id)).toEqual(['p0'])
  })

  it('the mafia channel is only present at night', () => {
    const night = stateWithRoles(ROLES)
    night.mafiaChannel.push({ speaker: 'p0', name: 'P0', text: 'kill p4' })
    expect(buildKnowledgeView(night, 'p0').mafiaChannel).toHaveLength(1)

    const day = stateWithRoles(ROLES)
    day.phase = 'day'
    day.mafiaChannel.push({ speaker: 'p0', name: 'P0', text: 'secret' })
    expect(buildKnowledgeView(day, 'p0').mafiaChannel).toBeUndefined()
  })

  it('the cop sees only its own investigation results', () => {
    const s = stateWithRoles(ROLES)
    s.copResults.push({ round: 1, target: 'p0', faction: 'mafia' })
    expect(buildKnowledgeView(s, 'p3').investigations).toEqual([
      { round: 1, target: 'p0', faction: 'mafia' },
    ])
    // a non-cop never sees investigations, even if results exist
    expect(buildKnowledgeView(s, 'p4').investigations).toBeUndefined()
  })

  it('property check: no role’s view leaks a secret it should not hold', () => {
    const s = stateWithRoles(ROLES)
    s.copResults.push({ round: 1, target: 'p1', faction: 'mafia' })
    // villager p5 is town, so nothing mafia-related should appear anywhere in
    // its view (no teammate, no dead mafia, no cop findings).
    const json = JSON.stringify(buildKnowledgeView(s, 'p5'))
    expect(json).not.toContain('mafia')
  })

  it('dead players’ roles stay hidden from the living (closed setup)', () => {
    const s = stateWithRoles(ROLES)
    s.players[0].alive = false // p0 (mafia) dies
    const v = buildKnowledgeView(s, 'p4') // a living villager
    expect(v.deadPlayers).toEqual([{ id: 'p0', name: 'P0' }]) // name only, no role
    expect(v.alivePlayers.find((p) => p.id === 'p0')).toBeUndefined()
    expect(v.spectator).toBeFalsy()
    expect(v.roles).toBeUndefined()
    expect(JSON.stringify(v)).not.toContain('mafia') // the dead mafia's role does not leak
  })

  it('an eliminated player becomes a spectator who sees every role', () => {
    const s = stateWithRoles(ROLES)
    s.players[4].alive = false // the villager p4 is out
    const v = buildKnowledgeView(s, 'p4')
    expect(v.spectator).toBe(true)
    expect(v.roles).toMatchObject({ p0: 'mafia', p1: 'mafia', p3: 'cop', p4: 'villager' })
  })
})
