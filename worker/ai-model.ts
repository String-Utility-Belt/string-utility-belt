/**
 * The model behind POST /api/generate, behind an interface so tests use a fake and never call
 * the API. The real client is Claude Haiku 5.5 through `@anthropic-ai/sdk`, loaded on first use.
 * Prices sit next to the model id: the daily budget (worker/ai-budget.ts) reserves and settles
 * with them, so a model change must change both together.
 */

export const MODEL_ID = 'claude-haiku-5-5'
export const MAX_OUTPUT_TOKENS = 1024

/**
 * Claude Haiku 5.5 list prices in micro-dollars per token ($0.10 / $0.50 per million tokens for a
 * prompt of up to 100K input tokens, $0.50 / $2.50 above). Cache writes (5-minute TTL) cost 1.25×
 * the input price and cache reads 0.1×.
 */
export const PRICING = {
  tierTokens: 100_000,
  standard: { input: 0.1, output: 0.5 },
  long: { input: 0.5, output: 2.5 },
  cacheWrite: 1.25,
  cacheRead: 0.1,
} as const

/**
 * Tokens the API adds around our text (message framing, the structured-output instructions it
 * derives from the schema), allowed on top of the byte count in the worst case.
 */
export const PROMPT_OVERHEAD_TOKENS = 4_000

export interface AiUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export interface AiRequest {
  /** Rules and catalog: the cached prefix. */
  system: string
  /** The user's description, the only user-supplied text sent. */
  description: string
  schema: Record<string, unknown>
}

export interface AiResponse {
  /** The JSON text of the answer, or null when the reply had no text block. */
  text: string | null
  stopReason: string | null
  usage: AiUsage
}

/**
 * The API call failed. `charged` is false only when the API answered with an error status, so it
 * cannot have billed; a timeout or a dropped connection may have been billed, so it is true.
 */
export class AiUpstreamError extends Error {
  constructor(message: string, readonly charged: boolean) {
    super(message)
    this.name = 'AiUpstreamError'
  }
}

export interface AiModel {
  generate(request: AiRequest): Promise<AiResponse>
}

const utf8Length = (s: string) => new TextEncoder().encode(s).length

/**
 * The most a call can cost, in micro-dollars, rounded up. A token always covers at least one
 * UTF-8 byte, so the prompt's byte count bounds its tokens whatever the tokenizer; all of it is
 * priced as a cache write, the dearest kind of input, plus every output token we allow.
 */
export function worstCaseMicro(request: AiRequest): number {
  const tokens = utf8Length(request.system) + utf8Length(request.description)
    + utf8Length(JSON.stringify(request.schema)) + PROMPT_OVERHEAD_TOKENS
  const tier = tokens > PRICING.tierTokens ? PRICING.long : PRICING.standard
  return Math.ceil(tokens * tier.input * PRICING.cacheWrite + MAX_OUTPUT_TOKENS * tier.output)
}

/** What a call cost, in micro-dollars, rounded up, from the usage the API reported. */
export function costMicro(usage: AiUsage): number {
  const write = usage.cache_creation_input_tokens ?? 0
  const read = usage.cache_read_input_tokens ?? 0
  const tier = usage.input_tokens + write + read > PRICING.tierTokens ? PRICING.long : PRICING.standard
  return Math.ceil(
    usage.input_tokens * tier.input
    + write * tier.input * PRICING.cacheWrite
    + read * tier.input * PRICING.cacheRead
    + usage.output_tokens * tier.output,
  )
}

export interface AnthropicModelOptions {
  apiKey: string
  timeoutMs?: number
}

/** The real model. No retries: a retried call could bill twice against one reservation. */
export function anthropicModel({ apiKey, timeoutMs = 20_000 }: AnthropicModelOptions): AiModel {
  let client: Promise<import('@anthropic-ai/sdk').default> | undefined
  const getClient = () => (client ??= import('@anthropic-ai/sdk').then(
    ({ default: Anthropic }) => new Anthropic({ apiKey, maxRetries: 0, timeout: timeoutMs }),
  ))
  return {
    async generate({ system, description, schema }) {
      const sdk = await import('@anthropic-ai/sdk')
      const anthropic = await getClient()
      let message
      try {
        message = await anthropic.messages.create({
          model: MODEL_ID,
          max_tokens: MAX_OUTPUT_TOKENS,
          thinking: { type: 'disabled' },
          output_config: { effort: 'low', format: { type: 'json_schema', schema } },
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: description }],
        })
      } catch (e) {
        if (e instanceof sdk.APIError && typeof e.status === 'number') {
          throw new AiUpstreamError(`the model API answered ${e.status}`, false)
        }
        throw new AiUpstreamError('the model API could not be reached', true)
      }
      const block = message.content.find(b => b.type === 'text')
      return {
        text: block && block.type === 'text' ? block.text : null,
        stopReason: message.stop_reason,
        usage: message.usage,
      }
    },
  }
}
