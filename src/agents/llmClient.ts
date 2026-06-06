// The single Anthropic-coupled module and the mockable seam. Uses adaptive
// thinking + effort so the bot reasons hard before committing, and
// output_config.format (json_schema) to get a guaranteed decision shape back.

import Anthropic from '@anthropic-ai/sdk'
import type { DecisionFormat } from '~/agents/schema'
import { EFFORT, MAX_TOKENS } from '~/config'

export interface LlmRequest {
  system: string
  user: string
  format: DecisionFormat
}

export interface LlmClient {
  // Returns the parsed structured-output object for downstream validation.
  complete(req: LlmRequest): Promise<unknown>
}

export function anthropicClient(model: string): LlmClient {
  const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment
  return {
    async complete({ system, user, format }) {
      const res = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' }, // the model thinks privately before deciding
        output_config: { format, effort: EFFORT },
        system,
        messages: [{ role: 'user', content: user }],
      })
      for (const block of res.content) {
        if (block.type === 'text') return JSON.parse(block.text)
      }
      throw new Error('model returned no structured decision')
    },
  }
}
