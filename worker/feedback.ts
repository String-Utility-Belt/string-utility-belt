/**
 * POST /api/feedback: emails a visitor's feedback, bug report or utility suggestion to us.
 * The body is one message from the form in src/app/feedback/, checked by the same rules the
 * form uses (src/lib/feedback.ts). It goes out through the `FEEDBACK` send_email binding,
 * which Cloudflare lets send only to our own address (wrangler.jsonc), so this route cannot
 * email anyone else. Nothing about the message or the request is kept here, and the email
 * carries only what the visitor typed and the page they sent it from.
 *
 * Only this site's pages may send (Sec-Fetch-Site, Origin), each client address gets a few
 * messages an hour, and a message whose hidden field is filled in (a bot) is accepted and
 * dropped. Without the binding (tests, local dev) the route answers 503, and the form offers
 * the visitor's own email app instead.
 */
import {
  checkFeedback, FEEDBACK_ADDRESS, FEEDBACK_KIND_LABELS, feedbackSubject, MAX_FEEDBACK_BYTES, type Feedback,
} from '../src/lib/feedback'
import type { ApiEnv } from './env'
import { isCrossSite, jsonError, readCapped, TooLargeError } from './http'
import { rateLimitKey, type RateLimiter } from './rate-limit'

/** The sender: an address on the site's own domain, the only kind Email Routing sends from. */
export const FEEDBACK_SENDER = { email: 'feedback@stringutilitybelt.com', name: 'String Utility Belt' }

export interface FeedbackDeps {
  limiter: RateLimiter
}

const sent = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })

/** The email for `f`, sent from a page on `origin`: plain text, and a reply goes to the visitor when they gave an address. */
export function feedbackEmail(f: Feedback, origin: string): EmailMessageBuilder {
  const text = [
    f.message,
    '',
    '—',
    `Kind: ${FEEDBACK_KIND_LABELS[f.kind]}`,
    `Reply to: ${f.email ?? 'no address given'}`,
    `Sent from: ${f.page ? `${origin}${f.page}` : 'unknown page'}`,
  ].join('\n')
  return {
    from: FEEDBACK_SENDER,
    to: FEEDBACK_ADDRESS,
    subject: feedbackSubject(f),
    text,
    ...(f.email ? { replyTo: f.email } : {}),
  }
}

export async function handleFeedback(request: Request, env: ApiEnv, deps: FeedbackDeps): Promise<Response> {
  if (request.method !== 'POST') return jsonError(405, 'use POST', {}, { allow: 'POST' })
  if (isCrossSite(request)) return jsonError(403, 'feedback is only accepted from this site')
  if (!env.FEEDBACK) return jsonError(503, `sending feedback is not set up here; write to ${FEEDBACK_ADDRESS}`)

  const wait = deps.limiter.hit(rateLimitKey(request.headers.get('cf-connecting-ip')))
  if (wait) return jsonError(429, `too many messages; try again in ${wait} s`, {}, { 'retry-after': String(wait) })

  let body: Uint8Array
  try {
    body = await readCapped(request.body, MAX_FEEDBACK_BYTES)
  } catch (e) {
    if (e instanceof TooLargeError) return jsonError(413, `a message is at most ${MAX_FEEDBACK_BYTES} bytes`)
    throw e
  }
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return jsonError(400, 'the body is not JSON')
  }
  const check = checkFeedback(raw)
  if (!check.ok) return jsonError(400, check.error, check.field ? { field: check.field } : {})
  if (check.bot) return sent()

  try {
    await env.FEEDBACK.send(feedbackEmail(check.feedback, new URL(request.url).origin))
  } catch (e) {
    // the error's code and message only: never the visitor's text or address
    const err = e as { code?: unknown; message?: unknown }
    console.error('feedback email failed', String(err?.code ?? ''), String(err?.message ?? e))
    return jsonError(502, 'the message could not be sent')
  }
  return sent()
}
