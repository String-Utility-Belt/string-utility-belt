import { describe, expect, it, vi } from 'vitest'
import { checkGenerated, generatePipeline } from './generate'

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': typeof body === 'string' ? 'text/html' : 'application/json; charset=utf-8', ...headers },
  })

const fake = (res: Response | Error) => vi.fn(async () => { if (res instanceof Error) throw res; return res })

describe('generatePipeline', () => {
  it('sends only the trimmed description, without cookies, to POST /api/generate', async () => {
    const f = fake(reply(200, { steps: [{ id: 'a', utilityId: 'base64_decode', params: {} }], why: ['decode it'], cached: false }))
    await generatePipeline('  decode base64  ', { fetchImpl: f })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generate')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(String(init.body))).toEqual({ description: 'decode base64' })
  })

  it('returns the checked steps with their reasons, notes and cache flag', async () => {
    const f = fake(reply(200, {
      steps: [{ id: 'a', utilityId: 'base64_decode', params: {} }, { id: 'b', utilityId: 'json_pretty', params: { indent: 4 } }],
      why: ['decode it', 'indent it'],
      notes: 'Left out x.',
      cached: true,
    }))
    const r = await generatePipeline('x', { fetchImpl: f })
    expect(r).toMatchObject({ status: 'ok', notes: 'Left out x.', cached: true })
    if (r.status !== 'ok') throw new Error('not ok')
    expect(r.steps.map(s => [('utilityId' in s.step) && s.step.utilityId, s.why])).toEqual([['base64_decode', 'decode it'], ['json_pretty', 'indent it']])
  })

  it('maps each error code, with its notes and Retry-After', async () => {
    for (const [status, code] of [[503, 'ai_off'], [503, 'ai_budget'], [400, 'ai_invalid'], [502, 'ai_upstream']] as const) {
      expect(await generatePipeline('x', { fetchImpl: fake(reply(status, { error: 'e', code })) })).toMatchObject({ status: 'error', code })
    }
    expect(await generatePipeline('x', { fetchImpl: fake(reply(429, { error: 'e', code: 'ai_rate' }, { 'retry-after': '43200' })) }))
      .toMatchObject({ status: 'error', code: 'ai_rate', retryAfter: 43200 })
    expect(await generatePipeline('x', { fetchImpl: fake(reply(422, { error: 'e', code: 'ai_unusable', notes: 'Left out y.' })) }))
      .toMatchObject({ status: 'error', code: 'ai_unusable', notes: 'Left out y.' })
  })

  it('says offline for a network error, a dev server page, a 403 without a code, or a broken body', async () => {
    for (const res of [new TypeError('failed'), reply(200, '<!doctype html>'), reply(403, { error: 'no' }), reply(200, '[1')]) {
      expect(await generatePipeline('x', { fetchImpl: fake(res) })).toEqual({ status: 'error', code: 'offline' })
    }
  })

  it('treats a reply with no step left after checking as unusable', async () => {
    const f = fake(reply(200, { steps: [{ id: 'a', utilityId: 'custom_js', params: {} }], why: ['run code'], cached: false }))
    expect(await generatePipeline('x', { fetchImpl: f })).toEqual({ status: 'error', code: 'ai_unusable' })
  })

  it('lets an abort through instead of reporting it', async () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' })
    await expect(generatePipeline('x', { fetchImpl: fake(err) })).rejects.toBe(err)
  })
})

describe('checkGenerated', () => {
  it('drops unknown, code and non-utility steps and keeps each reason beside its own step', () => {
    const out = checkGenerated(
      [
        { id: 'a', utilityId: 'no_such_utility', params: {} },
        { id: 'b', utilityId: 'custom_js', params: { code: 'x' } },
        { id: 'c', type: 'branch', branches: [[{ id: 'd', utilityId: 'base64_decode' }]] },
        'junk',
        { id: 'e', utilityId: 'base64_decode', params: {} },
      ],
      ['one', 'two', 'three', 'four', 'five'],
    )
    expect(out.map(s => s.why)).toEqual(['five'])
    expect(checkGenerated('nope', [])).toEqual([])
  })
})
