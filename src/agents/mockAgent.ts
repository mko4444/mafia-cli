// A no-API agent for --mock mode and CI. Decides purely from the (firewalled)
// KnowledgeView so mock games still demonstrate correct hidden-information play.

import type { PlayerAgent } from '~/agents/PlayerAgent'
import { allowedTargets } from '~/agents/prompt'
import { pick, type Rng } from '~/core/rng'
import { factionOf, type AgentDecision, type KnowledgeView, type PlayerId } from '~/core/types'

export function makeMockAgent(id: PlayerId, rng: Rng): PlayerAgent {
  return {
    id,
    async decide(view, request): Promise<AgentDecision> {
      const targets = allowedTargets(view, request.ask)
      const target = targets.length ? pick(targets, rng) : undefined
      const others = view.alivePlayers.filter((p) => p.id !== view.you.id)
      // never vote for yourself
      const voteFor = others.length ? pick(others, rng).id : 'abstain'
      return {
        reasoning: '(mock agent)',
        suspicions: {},
        publicStatement: mockStatement(view, request.ask, rng),
        action: target,
        vote: request.ask === 'vote' ? voteFor : undefined,
      }
    },
  }
}

// A plausible in-character line — also the AI agent's fallback when the LLM fails,
// so a broken bot still says something real instead of "...".
export function mockStatement(view: KnowledgeView, ask: string, rng: Rng): string {
  const others = view.alivePlayers.filter((p) => p.id !== view.you.id)
  const someone = others.length ? pick(others, rng).name : 'someone'
  return statement(view, ask, someone, rng)
}

function statement(
  view: KnowledgeView,
  ask: string,
  someone: string,
  rng: Rng,
): string {
  if (ask === 'mafiaKill') return `Let's take out ${someone} tonight.`
  if (ask === 'vote') return `I'm putting my vote on ${someone} — I don't trust them.`
  if (ask === 'daySpeak') {
    const town = [
      `${someone} has been awfully quiet — that worries me.`,
      `I've got nothing solid yet, but my gut says ${someone}.`,
      `Let's not rush this. Who actually has information?`,
      `I'm Town, for what it's worth. ${someone} feels off to me.`,
    ]
    const mafia = [
      `Honestly? ${someone} is acting like they're hiding something.`,
      `I'd slow down — lynching at random just helps the Mafia.`,
      `I trust the quieter folks. ${someone}, you've been pushy.`,
    ]
    const pool = factionOf(view.you.role) === 'mafia' ? mafia : town
    return pick(pool, rng)
  }
  return ''
}
