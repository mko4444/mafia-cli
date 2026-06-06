// Turns a (firewalled) KnowledgeView into prompt text. This module accepts ONLY a
// KnowledgeView — it has no access to GameState, so it cannot leak a secret.

import type { Ask } from '~/agents/PlayerAgent'
import type { Persona } from '~/agents/personas'
import {
  factionOf,
  type GameLogEvent,
  type KnowledgeView,
  type PlayerId,
  type Role,
} from '~/core/types'

const RULES = `Mafia is a social deduction game. Town (Doctor, Cop, Villagers) tries to eliminate the Mafia; the Mafia try to outlast the Town.
- NIGHT: the Mafia secretly pick someone to kill; the Doctor secretly protects one player; the Cop secretly learns one player's faction.
- DAY: everyone discusses and accuses.
- VOTE: everyone votes; the plurality target is lynched (a tie means no lynch).
Town wins when all Mafia are dead. Mafia win when they reach parity with the Town.`

const objective = (role: Role): string =>
  factionOf(role) === 'mafia'
    ? 'You are MAFIA. Win by deceiving the Town: blend in, deflect suspicion, and coordinate kills. You may lie freely.'
    : role === 'cop'
      ? 'You are the COP (Town). Use your night investigations to find Mafia — but reveal what you know carefully; outing yourself makes you a target.'
      : role === 'doctor'
        ? 'You are the DOCTOR (Town). Protect key players at night and help the Town reason toward the Mafia by day.'
        : 'You are a VILLAGER (Town). You have no night power — your weapon is logic and reading the table.'

// Elite, faction-specific tactics. This is what makes the bots hard to crack —
// it shapes reasoning and rhetoric only; secrecy is enforced by the firewall.
const strategy = (role: Role): string =>
  factionOf(role) === 'mafia'
    ? [
        'How to win as Mafia — be a ruthless deceiver:',
        '- Blend in: never the loudest or the quietest. Volunteer reads, vote, ask questions like a townie would.',
        '- Do not over-defend when accused; calm, specific counter-points read as innocent. Panicking reads as guilty.',
        '- Manufacture consensus: seed a suspicion early, then "reluctantly agree" with others to push it as a group.',
        "- Bus your partner when it buys you credibility or saves you — a Mafia who helps lynch a townie looks clean. Use the night channel to coordinate who eats the bus.",
        "- Mirror the Town's own logic back at them. Adopt their framework, then steer its conclusion onto a townie.",
        '- Build a paper trail of "town-reads" and reasonable votes so your later moves are trusted.',
        '- Pick night kills to frame: kill so the timing implicates a specific townie, or remove whoever is closing in on you. Never reveal partner knowledge in public.',
      ].join('\n')
    : [
        'How to win as Town — be impossible to fool:',
        '- Pressure-test every claim. Ask pointed, specific questions and watch who dodges, over-explains, or answers a different question.',
        '- Track behavior over time: who started bandwagons, who voted against the grain, who benefits from each death. Mafia leave a pattern.',
        '- Distrust easy consensus — Mafia love a quiet, comfortable lynch. Slow down and demand reasons.',
        role === 'cop'
          ? '- As Cop: investigate the influential and the slippery, not the obvious. Time any claim for maximum impact; a premature claim just paints a target.'
          : role === 'doctor'
            ? '- As Doctor: protect likely power roles and whoever the Mafia would most want dead; stay hidden so they waste kills.'
            : '- As Villager: your vote and your reads are your only power — be precise and make others account for theirs.',
      ].join('\n')

const NEGOTIATION = [
  'Negotiation — win the room, not just the argument:',
  '- Build coalitions and trade votes ("I\'ll back your read on X if you hold off on me").',
  '- Make credible commitments and threats, then follow through so your word carries weight.',
  '- Count votes constantly. Isolate your target, deny them allies, and lock the lynch before the count can swing back.',
].join('\n')

export function buildSystemPrompt(role: Role, persona: Persona): string {
  return [
    `You are ${persona.name}, a player in a game of Mafia. Play to win — be sharp, deceptive when it serves you, and a master negotiator.`,
    `Persona: ${persona.personality}`,
    '',
    RULES,
    '',
    objective(role),
    '',
    strategy(role),
    '',
    NEGOTIATION,
    '',
    "Voice: talk like a real person in a group chat, NOT an AI. Keep it SHORT — usually one sentence, two max. Casual and direct: contractions, fragments, lowercase are fine. React to what someone just said and name them. No preamble, no hedging ('I think it's worth noting…'), no recapping the game state, no bullet points, no over-explaining. Pick a side and say it plainly. When you vote, one line on who and why.",
    'Your `reasoning` is private and never shown to anyone — think honestly there, even when you intend to lie in public.',
    'Keep `notes` as your private running game plan and rewrite it each turn so your story stays consistent across the game.',
  ].join('\n')
}

// ── view → readable text ──
function nameMap(v: KnowledgeView): Map<PlayerId, string> {
  const m = new Map<PlayerId, string>()
  m.set(v.you.id, v.you.name)
  for (const p of v.alivePlayers) m.set(p.id, p.name)
  for (const p of v.deadPlayers) m.set(p.id, p.name)
  return m
}

function renderLog(v: KnowledgeView, nm: Map<PlayerId, string>): string {
  const nameOf = (id: PlayerId) => nm.get(id) ?? id
  const lines = v.publicLog.map((e: GameLogEvent) => {
    switch (e.type) {
      case 'phase':
        return `— ${e.phase.toUpperCase()} ${e.round} —`
      case 'statement':
        return `${nameOf(e.speaker)}: "${e.text}"`
      case 'vote':
        return `${nameOf(e.voter)} voted ${e.target === 'abstain' ? 'to abstain' : nameOf(e.target)}`
      case 'death':
        return `${nameOf(e.victim)} died (${e.cause})` // role stays hidden until game over
      case 'saved':
        return `No one died that night (the Doctor saved them).`
    }
  })
  return lines.length ? lines.join('\n') : '(nothing has happened yet)'
}

// Targets the agent is allowed to pick, derived purely from the view.
export function allowedTargets(v: KnowledgeView, ask: Ask): PlayerId[] {
  const living = v.alivePlayers.map((p) => p.id)
  const mates = new Set([v.you.id, ...(v.mafiaTeammates?.map((t) => t.id) ?? [])])
  switch (ask) {
    case 'mafiaKill':
      return living.filter((id) => !mates.has(id))
    case 'copInvestigate':
      return living.filter((id) => id !== v.you.id)
    case 'doctorSave':
    case 'vote':
    case 'daySpeak':
      return living
  }
}

function askLine(v: KnowledgeView, ask: Ask, nm: Map<PlayerId, string>): string {
  const list = allowedTargets(v, ask)
    .map((id) => `${nm.get(id) ?? id}(${id})`)
    .join(', ')
  switch (ask) {
    case 'mafiaKill':
      return `It is night. Discuss with your partner in the private channel, then set \`action\` to the player id you want to kill. Valid targets: ${list}.`
    case 'doctorSave':
      return `It is night. Set \`action\` to the player id you protect (you may protect yourself). Valid targets: ${list}.`
    case 'copInvestigate':
      return `It is night. Set \`action\` to the player id you investigate; you'll learn their faction. Valid targets: ${list}.`
    case 'daySpeak':
      return `It is the day discussion. In \`publicStatement\`, speak to the table — react to what others just said (name them), accuse, defend, or share a read, and steer the room.`
    case 'vote':
      return `It is the vote. Set \`vote\` to the player id you want lynched, or 'abstain', and in \`publicStatement\` argue your vote out loud. Valid targets: ${list}.`
  }
}

export function buildUserPrompt(v: KnowledgeView, ask: Ask, memory = ''): string {
  const nm = nameMap(v)
  const out: string[] = []
  out.push(
    `You are ${v.you.name} (${v.you.id}), the ${v.you.role}. It is ${v.phase}, round ${v.round}.`,
  )
  if (memory) out.push('', 'Your private notes so far:', memory)
  out.push(
    `Alive: ${v.alivePlayers.map((p) => `${p.name}(${p.id})`).join(', ')}`,
  )
  if (v.deadPlayers.length) {
    out.push(
      `Dead (roles still unknown): ${v.deadPlayers.map((p) => `${p.name}(${p.id})`).join(', ')}`,
    )
  }
  if (v.mafiaTeammates) {
    out.push(
      `Your Mafia partner(s): ${v.mafiaTeammates.map((t) => `${t.name}(${t.id})`).join(', ') || '(none left)'}`,
    )
  }
  if (v.investigations?.length) {
    out.push(
      `Your investigations: ${v.investigations
        .map((r) => `night ${r.round}: ${nm.get(r.target) ?? r.target} is ${r.faction}`)
        .join('; ')}`,
    )
  }
  if (v.mafiaChannel) {
    const ch = v.mafiaChannel
      .map((m) => `${m.name}: "${m.text}"`)
      .join('\n')
    out.push(`Mafia channel so far:\n${ch || '(empty)'}`)
  }
  out.push('', 'What has happened publicly:', renderLog(v, nm))
  out.push('', askLine(v, ask, nm))
  return out.join('\n')
}
