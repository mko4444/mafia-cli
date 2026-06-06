// The single Anthropic-coupled module and the mockable seam. The SDK is imported
// LAZILY (and is an optional dependency) so only a host actually running real bots
// ever loads it — the join/client path and mock games never need it installed.

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
  const load = () => import('@anthropic-ai/sdk').then((m) => new m.default()) // reads ANTHROPIC_API_KEY
  let client: ReturnType<typeof load> | null = null
  return {
    async complete({ system, user, format }) {
      const sdk = await (client ??= load())
      const res = await sdk.messages.create({
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
