import { describe, expect, it, vi } from 'vitest'
import { FEEDBACK_PATH, type FeedbackRequest } from '@/lib/feedback'
import { sendFeedback } from './send'

const REQUEST: FeedbackRequest = { kind: 'utility', message: 'CSV to a Markdown table', page: '/utilities/', website: '' }

const answering = (res: Response | Error) => vi.fn(async () => { if (res instanceof Error) throw res; return res }) as unknown as typeof fetch

describe('sendFeedback', () => {
  it('posts the message as JSON, without credentials, and counts only a 204 as sent', async () => {
    const fetchImpl = answering(new Response(null, { status: 204 }))
    expect(await sendFeedback(REQUEST, fetchImpl)).toEqual({ status: 'sent' })
    expect(fetchImpl).toHaveBeenCalledWith(FEEDBACK_PATH, expect.objectContaining({
      method: 'POST', credentials: 'omit', body: JSON.stringify(REQUEST),
    }))
    // a dev server's index.html is not a sent message
    expect(await sendFeedback(REQUEST, answering(new Response('<!doctype html>', { status: 200 })))).toEqual({ status: 'unavailable' })
  })

  it('passes on the Worker’s reason and field for a refused message', async () => {
    const res = Response.json({ error: 'That email address doesn’t look right.', field: 'email' }, { status: 400 })
    expect(await sendFeedback(REQUEST, answering(res))).toEqual({ status: 'invalid', field: 'email', error: 'That email address doesn’t look right.' })
    const unknownField = Response.json({ error: 'Nope.', field: 'ip' }, { status: 400 })
    expect(await sendFeedback(REQUEST, answering(unknownField))).toEqual({ status: 'invalid', field: undefined, error: 'Nope.' })
  })

  it('reads Retry-After from a rate-limited answer', async () => {
    const res = new Response(null, { status: 429, headers: { 'retry-after': '1200' } })
    expect(await sendFeedback(REQUEST, answering(res))).toEqual({ status: 'limited', retryAfter: 1200 })
  })

  it.each([
    ['offline', new TypeError('Failed to fetch')],
    ['email not set up', new Response(null, { status: 503 })],
    ['delivery failed', new Response(null, { status: 502 })],
    ['a 400 that is not the Worker’s', new Response('Bad Request', { status: 400 })],
  ])('falls back to the email app when %s', async (_, res) => {
    expect(await sendFeedback(REQUEST, answering(res))).toEqual({ status: 'unavailable' })
  })
})
