import type { UtilityMeta } from '../src/core/registry'
import type { Utility, UtilityExample } from '../src/types/utility'
import type { AiModel } from './ai-model'

/**
 * Bindings and vars the Worker reads. Declared here rather than merged into the
 * generated `Cloudflare.Env`, so re-running `wrangler types` (which emits a required
 * `ASSETS`) cannot conflict; both are optional because tests and a bare
 * `wrangler dev` run without them.
 */
export interface ApiEnv {
  /** `off` disables `/api/fetch` (503). Set with `wrangler secret`/`vars` or the dashboard. */
  FETCH_PROXY?: string
  /** The built SPA in ./dist; only consulted for non-API paths. */
  ASSETS?: Fetcher
  /** Workers Analytics Engine dataset `POST /api/event` adds to (`wrangler.jsonc`); without it events are dropped. */
  EVENTS?: AnalyticsEngineDataset
  /**
   * D1 database `sub-events`: the same events as rows, which a dashboard queries live through
   * the Cloudflare connector (`migrations/` has the table); pruned daily by `scheduled`.
   */
  EVENTS_DB?: D1Database
  /**
   * Email Service binding `POST /api/feedback` sends through, pinned to our own address
   * (`wrangler.jsonc`); without it the route answers 503 and the form offers a `mailto:` link.
   */
  FEEDBACK?: SendEmail
  /**
   * `on` turns on POST /api/generate, the AI pipeline builder; anything else (or a missing
   * key, salt or EVENTS_DB) answers 503, so a deploy without the secrets stays safe.
   */
  AI_GENERATE?: string
  /** Secret: the Anthropic API key the pipeline builder calls Claude with. */
  ANTHROPIC_API_KEY?: string
  /** Secret: keys the per-client daily count's address hash (worker/ai-budget.ts). */
  AI_IP_SALT?: string
  /** What the pipeline builder may spend per UTC day, in US dollars (default 5). */
  AI_DAILY_BUDGET_USD?: string
  /** Model calls one client may make per UTC day (default 10). */
  AI_IP_DAILY_LIMIT?: string
}

/** The slice of a utility registry the API needs (the static registry in production). */
export interface ApiRegistry {
  list(): UtilityMeta[]
  get(id: string): UtilityMeta | undefined
  load(id: string): Promise<Utility> | Utility
}

export type UpstreamFetch = (url: string, init: RequestInit) => Promise<Response>

/** Every limit and dependency is injectable so tests can shrink or fake them. */
export interface ApiOptions {
  registry?: ApiRegistry
  examples?: Record<string, UtilityExample[]>
  /** POST /api/run */
  maxBodyBytes?: number
  maxSteps?: number
  /** Ceiling on a decompressed `share` payload, in characters. */
  maxShareChars?: number
  /** Ceiling on any step's output and on the final output (string length or byte length). */
  maxValueSize?: number
  /** PBKDF2 work one request may ask for, in HMAC blocks (iterations × blocks per key). */
  pbkdf2Budget?: number
  /** Items "run on each" steps may process in one request (the engine's default is far higher). */
  maxEachItems?: number
  runTimeoutMs?: number
  /** Step-timing clock handed to the runner. */
  clock?: () => number
  /** GET /api/fetch */
  fetchTimeoutMs?: number
  maxFetchBytes?: number
  maxRedirects?: number
  rateLimit?: { limit: number; windowMs: number }
  /** POST /api/run, per client IP (a bucket separate from the fetch proxy's). */
  runRateLimit?: { limit: number; windowMs: number }
  /** POST /api/event, per client IP. */
  eventRateLimit?: { limit: number; windowMs: number }
  /** POST /api/feedback, per client IP. */
  feedbackRateLimit?: { limit: number; windowMs: number }
  /** POST /api/generate bursts, per client IP (the daily count is in D1). */
  generateRateLimit?: { limit: number; windowMs: number }
  /** Rate-limiter clock; also the pipeline builder's clock for UTC days and cache ages. */
  now?: () => number
  /** The pipeline builder's model; tests inject a fake so no test calls the real API. */
  aiModel?: (env: ApiEnv) => AiModel
  /** Defaults to the global `fetch`, looked up per call so tests can stub it. */
  upstreamFetch?: UpstreamFetch
}
