/**
 * The Worker's request router. `wrangler.jsonc` sends `/api/*` here first
 * (`assets.run_worker_first`); everything else is the SPA in ./dist.
 *
 *   POST    /api/run               run a pipeline            (public CORS)
 *   GET     /api/utilities         list / search utilities   (public CORS)
 *   GET     /api/utilities/:id     one utility + examples    (public CORS)
 *   GET     /api/fetch?url=        same-origin fetch proxy   (no CORS)
 *   POST    /api/event             count a site event        (same-origin, no CORS)
 *   POST    /api/feedback          email us a visitor's message (same-origin, no CORS)
 */
import { EVENT_PATH } from '../src/lib/countedEvents'
import { FEEDBACK_PATH } from '../src/lib/feedback'
import { MANIFEST } from '../src/utilities/_generated/manifest'
import { EXAMPLES } from '../src/utilities/_generated/examples'
import { staticRegistry } from '../src/utilities/static-registry'
import type { ApiEnv, ApiOptions } from './env'
import { handleEvent } from './events'
import { handleFeedback } from './feedback'
import { handleFetchProxy } from './fetch-proxy'
import { CORS_HEADERS, jsonError } from './http'
import { createRateLimiter, rateLimitKey } from './rate-limit'
import { handleRun } from './run'
import { handleUtilities } from './utilities'

export interface Api {
  fetch(request: Request, env?: ApiEnv, ctx?: unknown): Promise<Response>
}

const MB = 1024 * 1024

const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS })

/** Responses built by our helpers have mutable headers; set CORS in place. */
function cors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v)
  return res
}

const isRun = (path: string) => path === '/api/run'
const isUtilities = (path: string) => path === '/api/utilities' || path.startsWith('/api/utilities/')

export function createApi(opts: ApiOptions = {}): Api {
  const registry = opts.registry ?? {
    list: () => MANIFEST,
    get: (id: string) => staticRegistry.get(id),
    load: (id: string) => staticRegistry.load(id),
  }
  const examples = opts.examples ?? EXAMPLES
  const limiter = createRateLimiter({ ...(opts.rateLimit ?? { limit: 30, windowMs: 60_000 }), now: opts.now })
  const runLimiter = createRateLimiter({ ...(opts.runRateLimit ?? { limit: 60, windowMs: 60_000 }), now: opts.now })
  const eventLimiter = createRateLimiter({ ...(opts.eventRateLimit ?? { limit: 30, windowMs: 60_000 }), now: opts.now })
  // a person sends one or two; more is a script filling our inbox
  const feedbackLimiter = createRateLimiter({ ...(opts.feedbackRateLimit ?? { limit: 5, windowMs: 3_600_000 }), now: opts.now })

  async function route(request: Request, url: URL, env: ApiEnv): Promise<Response> {
    const path = url.pathname
    const method = request.method

    if (isRun(path)) {
      if (method === 'OPTIONS') return preflight()
      if (method !== 'POST') return cors(jsonError(405, 'use POST', {}, { allow: 'POST, OPTIONS' }))
      const wait = runLimiter.hit(rateLimitKey(request.headers.get('cf-connecting-ip')))
      if (wait) {
        return cors(jsonError(429, `too many runs; try again in ${wait} s`, {}, { 'retry-after': String(wait) }))
      }
      return cors(await handleRun(request, {
        registry,
        maxBodyBytes: opts.maxBodyBytes ?? MB,
        maxSteps: opts.maxSteps ?? 100,
        maxShareChars: opts.maxShareChars ?? 2 * MB,
        maxValueSize: opts.maxValueSize ?? 8 * MB,
        pbkdf2Budget: opts.pbkdf2Budget ?? 1_000_000,
        maxEachItems: opts.maxEachItems ?? 10_000,
        timeoutMs: opts.runTimeoutMs ?? 10_000,
        clock: opts.clock,
      }))
    }

    if (isUtilities(path)) {
      if (method === 'OPTIONS') return preflight()
      if (method !== 'GET' && method !== 'HEAD') return cors(jsonError(405, 'use GET', {}, { allow: 'GET, HEAD, OPTIONS' }))
      const res = cors(handleUtilities(url, { registry, examples }))
      return method === 'HEAD' ? new Response(null, res) : res
    }

    if (path === '/api/fetch') {
      return handleFetchProxy(request, env, {
        limiter,
        timeoutMs: opts.fetchTimeoutMs ?? 10_000,
        maxBytes: opts.maxFetchBytes ?? 5 * MB,
        maxRedirects: opts.maxRedirects ?? 3,
        upstreamFetch: opts.upstreamFetch,
      })
    }

    if (path === EVENT_PATH) return handleEvent(request, env, { limiter: eventLimiter })

    if (path === FEEDBACK_PATH) return handleFeedback(request, env, { limiter: feedbackLimiter })

    return jsonError(404, `no API route for ${method} ${path.slice(0, 200)}`)
  }

  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url)
      if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
        return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 })
      }
      try {
        return await route(request, url, env)
      } catch (e) {
        console.error('api error', e)
        const res = jsonError(500, 'internal error')
        return isRun(url.pathname) || isUtilities(url.pathname) ? cors(res) : res
      }
    },
  }
}
