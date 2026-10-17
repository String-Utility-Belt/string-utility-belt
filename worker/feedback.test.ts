// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { FEEDBACK_ADDRESS } from '../src/lib/feedback'
import { createApi } from './api'
import type { ApiEnv } from './env'
import { FEEDBACK_SENDER } from './feedback'

const ORIGIN = 'https://stringutilitybelt.com'
const SAME_SITE = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: ORIGIN }
const MESSAGE = { kind: 'utility', message: 'A utility that turns CSV into a Markdown table, please.', page: '/utilities/', website: '' }

function setup({ limit = 5, send = vi.fn(async () => ({ messageId: 'm-1' })) } = {}) {
  const env: ApiEnv = { FEEDBACK: { send } }
  const api = createApi({ feedbackRateLimit: { limit, windowMs: 3_600_000 } })
  const post = (body: unknown, headers: Record<string, string> = SAME_SITE, method = 'POST', ip = '203.0.113.7') =>
    api.fetch(new Request(`${ORIGIN}/api/feedback`, {
      method,
      headers: { 'cf-connecting-ip': ip, ...headers },
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }), env)
  return { post, send }
}

describe('POST /api/feedback', () => {
  it('emails the message to our address, from our domain, with a reply to the visitor', async () => {
    const { post, send } = setup()
    const res = await post({ ...MESSAGE, email: ' ada@example.com ' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      from: FEEDBACK_SENDER,
      to: FEEDBACK_ADDRESS,
      subject: 'Utility suggestion: A utility that turns CSV into a Markdown table, please.',
      text: [
        'A utility that turns CSV into a Markdown table, please.',
        '',
        '—',
        'Kind: Utility suggestion',
        'Reply to: ada@example.com',
        `Sent from: ${ORIGIN}/utilities/`,
      ].join('\n'),
      replyTo: 'ada@example.com',
    })
  })

  it('sends no reply address when the visitor gave none', async () => {
    const { post, send } = setup()
    expect((await post({ kind: 'bug', message: 'The hex view freezes on a 2 MB file.', website: '' })).status).toBe(204)
    const [email] = send.mock.calls[0] as unknown as [EmailMessageBuilder]
    expect(email).not.toHaveProperty('replyTo')
    expect(email.text).toContain('Reply to: no address given\nSent from: unknown page')
  })

  it.each([
    ['an unknown kind', { ...MESSAGE, kind: 'praise' }, 'kind'],
    ['a message that is too short', { ...MESSAGE, message: '  hi  ' }, 'message'],
    ['a message that is too long', { ...MESSAGE, message: 'x'.repeat(4001) }, 'message'],
    ['a malformed reply address', { ...MESSAGE, email: 'ada@example.com\r\nBcc: victim@example.net' }, 'email'],
    ['a page with a fragment, which can carry input', { ...MESSAGE, page: '/#/p/N4Ig' }, 'page'],
    ['an extra field', { ...MESSAGE, input: 'secret' }, undefined],
  ])('refuses %s without sending it', async (_, body, field) => {
    const { post, send } = setup()
    const res = await post(body)
    expect(res.status).toBe(400)
    expect((await res.json() as { field?: string }).field).toBe(field)
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses a body that is not JSON, or too long to be a message', async () => {
    const { post, send } = setup()
    expect((await post('{nope')).status).toBe(400)
    expect((await post({ ...MESSAGE, message: 'x'.repeat(40_000) })).status).toBe(413)
    expect(send).not.toHaveBeenCalled()
  })

  it('accepts and drops a message whose hidden field a bot filled in', async () => {
    const { post, send } = setup()
    expect((await post({ ...MESSAGE, website: 'https://spam.example' })).status).toBe(204)
    expect(send).not.toHaveBeenCalled()
  })

  it('only takes messages from pages on this site', async () => {
    const { post, send } = setup()
    expect((await post(MESSAGE, { 'content-type': 'application/json' })).status).toBe(403)
    expect((await post(MESSAGE, { ...SAME_SITE, 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await post(MESSAGE, { ...SAME_SITE, origin: 'https://evil.example' })).status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('answers only POST', async () => {
    const { post } = setup()
    const res = await post(undefined, SAME_SITE, 'GET')
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })

  it('limits each client address to a few messages', async () => {
    const { post, send } = setup({ limit: 2 })
    expect((await post(MESSAGE)).status).toBe(204)
    expect((await post(MESSAGE)).status).toBe(204)
    const limited = await post(MESSAGE)
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await post(MESSAGE, SAME_SITE, 'POST', '198.51.100.4')).status).toBe(204)
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('answers 502, logging the error code but not the message, when the email cannot be sent', async () => {
    const error = Object.assign(new Error('Could not deliver the email'), { code: 'E_DELIVERY_FAILED' })
    const { post } = setup({ send: vi.fn(async () => { throw error }) })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await post({ ...MESSAGE, email: 'ada@example.com' })
      expect(res.status).toBe(502)
      expect(log).toHaveBeenCalledWith('feedback email failed', 'E_DELIVERY_FAILED', 'Could not deliver the email')
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/Markdown table|ada@example\.com/)
    } finally {
      log.mockRestore()
    }
  })

  it('answers 503 without the binding (tests, local dev), so the form offers the visitor’s email app', async () => {
    const api = createApi()
    const res = await api.fetch(new Request(`${ORIGIN}/api/feedback`, {
      method: 'POST', headers: SAME_SITE, body: JSON.stringify(MESSAGE),
    }), {})
    expect(res.status).toBe(503)
  })
})
