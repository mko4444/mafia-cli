// Structured output via output_config.format (json_schema). The model thinks
// privately (adaptive thinking) and returns this exact shape. `reasoning` is a
// short private summary surfaced only in the post-game reveal; `notes` is the
// bot's running strategy scratchpad, fed back to it next turn (see aiAgent).

import { z } from 'zod'
import type { Ask } from '~/agents/PlayerAgent'
import type { AgentDecision } from '~/core/types'

// A json_schema output format passed to client.messages.create via output_config.
export interface DecisionFormat {
  type: 'json_schema'
  schema: Record<string, unknown>
}

const wantsAction = (ask: Ask) =>
  ask === 'mafiaKill' || ask === 'doctorSave' || ask === 'copInvestigate'

// Strict structured outputs require additionalProperties:false and disallow
// open-ended maps, so every field here is a plain string.
export function decisionFormat(ask: Ask): DecisionFormat {
  const required = ['reasoning', 'notes', 'publicStatement']
  if (wantsAction(ask)) required.push('action')
  if (ask === 'vote') required.push('vote')
  return {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        reasoning: {
          type: 'string',
          description:
            'Private. A few sentences on your real read and plan this turn — never shown to other players.',
        },
        notes: {
          type: 'string',
          description:
            'Private. Your running strategy scratchpad, carried to your next turn: lies you are maintaining, who you are framing/busing, coalition plans, per-player reads, and the live vote count. Rewrite it in full each turn.',
        },
        publicStatement: {
          type: 'string',
          description:
            ask === 'mafiaKill'
              ? 'What you say to your fellow mafia in the private night channel.'
              : ask === 'daySpeak'
                ? 'What you say out loud to the whole table — react to what others said, by name.'
                : ask === 'vote'
                  ? 'Say out loud who you are voting for and why — make your case.'
                  : 'A short public remark.',
        },
        action: { type: 'string', description: 'The player id you target this night.' },
        vote: { type: 'string', description: "The player id you vote to lynch, or 'abstain'." },
      },
      required,
      additionalProperties: false,
    },
  }
}

const decisionZod = z.object({
  reasoning: z.string(),
  notes: z.string().optional(),
  publicStatement: z.string(),
  action: z.string().optional(),
  vote: z.string().optional(),
})

// Validate a raw structured-output object into an AgentDecision; throws if malformed.
export function parseDecision(raw: unknown): AgentDecision {
  const d = decisionZod.parse(raw)
  return {
    reasoning: d.reasoning,
    suspicions: {},
    notes: d.notes,
    publicStatement: d.publicStatement,
    action: d.action,
    vote: d.vote,
  }
}
