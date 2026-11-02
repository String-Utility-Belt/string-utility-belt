/**
 * POST /api/event: adds one to a count. The body is one event from the allow-list in
 * src/lib/countedEvents.ts; it becomes a Workers Analytics Engine data point whose
 * index is the event name and whose blobs are its ids, and the same name and ids as a
 * row of the D1 table `events` (which the dashboard queries live). Nothing about the
 * request — address, user agent, country, time beyond the row's own — is stored.
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

/** Days a D1 event row is kept: the three months the privacy policy promises, as Analytics Engine keeps them. */
export const EVENT_RETENTION_DAYS = 92

/** Deletes D1 event rows older than EVENT_RETENTION_DAYS (the daily cron, worker/index.ts). */
export async function pruneEvents(env: ApiEnv): Promise<void> {
  await env.EVENTS_DB?.prepare("DELETE FROM events WHERE ts < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)")
    .bind(`-${EVENT_RETENTION_DAYS} days`)
    .run()
}

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

  const [blob1, blob2] = eventFields(event)
  env.EVENTS?.writeDataPoint({ indexes: [event.name], blobs: [blob1, blob2], doubles: [1] })
  try {
    await env.EVENTS_DB?.prepare('INSERT INTO events (name, blob1, blob2) VALUES (?, ?, ?)').bind(event.name, blob1, blob2).run()
  } catch (e) {
    // the Analytics Engine count stands; a lost row is not the visitor's problem
    console.error(`[event] D1 insert failed: ${e instanceof Error ? e.message : String(e)}`)
  }
  return accepted()
}
