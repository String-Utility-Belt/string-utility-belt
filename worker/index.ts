import { createApi } from './api'
import type { ApiEnv } from './env'
import { pruneEvents } from './events'

const api = createApi()

/**
 * Cloudflare Worker entry: the HTTP API, falling back to the static SPA (routes: ./api.ts),
 * and the daily cron (wrangler.jsonc) that prunes old event rows.
 */
export default {
  fetch: (request, env, ctx) => api.fetch(request, env, ctx),
  scheduled: (_controller, env, ctx) => ctx.waitUntil(pruneEvents(env)),
} satisfies ExportedHandler<ApiEnv>
