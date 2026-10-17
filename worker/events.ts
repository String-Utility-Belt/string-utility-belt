/**
 * POST /api/event: adds one to a count. The body is one event from the allow-list in
 * src/lib/countedEvents.ts; it becomes a Workers Analytics Engine data point whose
 * index is the event name and whose blobs are its ids. Nothing about the request —
 * address, user agent, country, time beyond the data point's own — is stored.
 *
 * Only this site's pages may send events (Sec-Fetch-Site, Origin), and each client
 * address is rate-limited in memory. Both stop casual inflation, not a determined
 * script, so counts are indicative: sponsors also see their clicks under their UTM
 * campaign.
 */
import { eventFields, MAX_EVENT_BYTES, parseCountedEvent } from '../src/lib/countedEvents'
import type { ApiEnv } from './env'
import { isCrossSite, jsonError, readCapped, TooLargeError } from './http'
import { rateLimitKey, type RateLimiter } from './rate-limit'

export interface EventDeps {
  limiter: RateLimiter
}

const accepted = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })

export async function handleEvent(request: Request, env: ApiEnv, deps: EventDeps): Promise<Response> {
  if (request.method !== 'POST') return jsonError(405, 'use POST', {}, { allow: 'POST' })
  if (isCrossSite(request)) return jsonError(403, 'events are only accepted from this site')

  const wait = deps.limiter.hit(rateLimitKey(request.headers.get('cf-connecting-ip')))
  if (wait) return jsonError(429, `too many events; try again in ${wait} s`, {}, { 'retry-after': String(wait) })

  let body: Uint8Array
  try {
    body = await readCapped(request.body, MAX_EVENT_BYTES)
  } catch (e) {
    if (e instanceof TooLargeError) return jsonError(413, `an event is at most ${MAX_EVENT_BYTES} bytes`)
    throw e
  }
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return jsonError(400, 'the body is not JSON')
  }
  const event = parseCountedEvent(raw)
  if (!event) return jsonError(400, 'not an event this site counts')

  env.EVENTS?.writeDataPoint({ indexes: [event.name], blobs: eventFields(event), doubles: [1] })
  return accepted()
}
