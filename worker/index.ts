import { pruneAi } from './ai-budget'
import { createApi } from './api'
import type { ApiEnv } from './env'
import { pruneEvents } from './events'

const api = createApi()

/**
 * Cloudflare Worker entry: the HTTP API, falling back to the static SPA (routes: ./api.ts),
 * and the daily cron (wrangler.jsonc) that prunes old event rows and the AI pipeline builder's
 * old counts, spend rows and cached answers. Each prune runs even when the other fails.
 */
export default {
  fetch: (request, env, ctx) => api.fetch(request, env, ctx),
  scheduled: (controller, env, ctx) => ctx.waitUntil(Promise.allSettled([
    pruneEvents(env),
    pruneAi(env.EVENTS_DB, controller.scheduledTime),
  ])),
} satisfies ExportedHandler<ApiEnv>
