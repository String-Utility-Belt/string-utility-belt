// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { ParamSpec } from '../src/types/utility'
import { MANIFEST } from '../src/utilities/_generated/manifest'
import { buildSystemPrompt } from './ai-catalog'
import { costMicro, worstCaseMicro, type AiModel, type AiRequest, type AiResponse, type AiUsage, AiUpstreamError } from './ai-model'
import { createApi } from './api'
import type { ApiEnv } from './env'
import { OUTPUT_SCHEMA, coerceValue } from './generate'
import { sqliteD1 } from './test-d1'

const ORIGIN = 'https://stringutilitybelt.com'
const SAME_SITE = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: ORIGIN }
const T0 = Date.UTC(2026, 10, 25, 12)
const USAGE: AiUsage = { input_tokens: 30, output_tokens: 150, cache_creation_input_tokens: 0, cache_read_input_tokens: 30_000 }

type Answer = { steps: Array<{ utilityId: string; params: Array<{ name: string; value: string }>; why: string }>; notes: string }
const answer = (steps: Answer['steps'], notes = ''): AiResponse =>
  ({ text: JSON.stringify({ steps, notes }), stopReason: 'end_turn', usage: USAGE })

const DECODE_AND_FORMAT = answer([
  { utilityId: 'base64_decode', params: [], why: 'Turns the base64 back into text.' },
  { utilityId: 'json_pretty', params: [{ name: 'indent', value: '4' }], why: 'Pretty-prints the JSON.' },
])

function setup(opts: {
  env?: Partial<ApiEnv>
  reply?: (req: AiRequest) => Promise<AiResponse> | AiResponse
} = {}) {
  const d1 = sqliteD1()
  let now = T0
  const generate = vi.fn(async (req: AiRequest) => (opts.reply ? opts.reply(req) : DECODE_AND_FORMAT))
  const model: AiModel = { generate }
  const env: ApiEnv = {
    AI_GENERATE: 'on', ANTHROPIC_API_KEY: 'test-key', AI_IP_SALT: 'test-salt', EVENTS_DB: d1.db, ...opts.env,
  }
  const api = createApi({ aiModel: () => model, now: () => now, generateRateLimit: { limit: 1000, windowMs: 60_000 } })
  const send = (body: unknown, { ip = '203.0.113.7', headers = SAME_SITE, method = 'POST' }:
    { ip?: string; headers?: Record<string, string>; method?: string } = {}) =>
    api.fetch(new Request(`${ORIGIN}/api/generate`, {
      method,
      headers: { 'cf-connecting-ip': ip, ...headers },
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }), env)
  const spend = () => d1.sqlite.prepare('SELECT day, reserved_micro, calls FROM ai_spend ORDER BY day').all()
  const ipCount = () => (d1.sqlite.prepare('SELECT SUM(count) AS n FROM ai_ip_daily').get() as { n: number | null }).n ?? 0
  return { send, generate, d1, spend, ipCount, setNow: (t: number) => { now = t } }
}

const worst = (description: string) =>
  worstCaseMicro({ system: buildSystemPrompt(MANIFEST), description, schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> })

describe('POST /api/generate: switched off', () => {
  it.each([
    ['AI_GENERATE unset', { AI_GENERATE: undefined }],
    ['AI_GENERATE off', { AI_GENERATE: 'off' }],
    ['AI_GENERATE true', { AI_GENERATE: 'true' }],
    ['no API key', { ANTHROPIC_API_KEY: undefined }],
    ['no IP salt', { AI_IP_SALT: undefined }],
    ['no database', { EVENTS_DB: undefined }],
    ['a budget that is not a number', { AI_DAILY_BUDGET_USD: 'five' }],
    ['a negative budget', { AI_DAILY_BUDGET_USD: '-1' }],
    ['a fractional per-client limit', { AI_IP_DAILY_LIMIT: '2.5' }],
  ])('answers 503 ai_off with %s, without calling the model', async (_name, env) => {
    const { send, generate } = setup({ env })
    const res = await send({ description: 'decode base64' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'ai_off' })
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('POST /api/generate: requests', () => {
  it('refuses other sites and other methods', async () => {
    const { send, generate } = setup()
    expect((await send({ description: 'x' }, { headers: { ...SAME_SITE, 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect((await send({ description: 'x' }, { headers: { ...SAME_SITE, origin: 'https://evil.example' } })).status).toBe(403)
    const get = await send(null, { method: 'GET' })
    expect(get.status).toBe(405)
    expect(get.headers.get('access-control-allow-origin')).toBeNull()
    expect(generate).not.toHaveBeenCalled()
  })

  it.each([
    ['not JSON', 'decode base64', 400],
    ['no description', {}, 400],
    ['a blank description', { description: '   ' }, 400],
    ['a description that is not text', { description: 42 }, 400],
    ['a description over 500 characters', { description: 'a'.repeat(501) }, 400],
    ['a body over 2,048 bytes', { description: 'a', pad: 'b'.repeat(2100) }, 413],
  ])('answers ai_invalid for %s', async (_name, body, status) => {
    const { send, generate } = setup()
    const res = await send(body)
    expect(res.status).toBe(status)
    expect(await res.json()).toMatchObject({ code: 'ai_invalid' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('accepts a description of exactly 500 characters once trimmed', async () => {
    const { send } = setup()
    expect((await send({ description: `  ${'a'.repeat(500)}  ` })).status).toBe(200)
  })

  it('limits bursts per client in memory', async () => {
    const d1 = sqliteD1()
    const api = createApi({ aiModel: () => ({ generate: async () => DECODE_AND_FORMAT }), now: () => T0 })
    const env: ApiEnv = { AI_GENERATE: 'on', ANTHROPIC_API_KEY: 'k', AI_IP_SALT: 's', EVENTS_DB: d1.db }
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      statuses.push((await api.fetch(new Request(`${ORIGIN}/api/generate`, {
        method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.1', ...SAME_SITE }, body: JSON.stringify({ description: `job ${i}` }),
      }), env)).status)
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
  })
})

describe('POST /api/generate: answers', () => {
  it('returns validated steps, sending the model only the description and the catalog', async () => {
    const { send, generate, spend } = setup()
    const res = await send({ description: '  Decode base64 then pretty-print the JSON ' })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json() as { steps: Array<Record<string, unknown>>; why: string[]; cached: boolean; notes?: string }
    expect(body.cached).toBe(false)
    expect(body.notes).toBeUndefined()
    expect(body.steps.map(s => [s.utilityId, s.params, s.enabled])).toEqual([
      ['base64_decode', {}, true],
      ['json_pretty', { indent: 4 }, true],
    ])
    expect(new Set(body.steps.map(s => s.id)).size).toBe(2)
    expect(body.why).toEqual(['Turns the base64 back into text.', 'Pretty-prints the JSON.'])

    expect(generate).toHaveBeenCalledTimes(1)
    const req = generate.mock.calls[0][0]
    expect(req.description).toBe('Decode base64 then pretty-print the JSON')
    expect(req.system).toBe(buildSystemPrompt(MANIFEST))
    expect(req.schema).toEqual(OUTPUT_SCHEMA)
    expect(spend()).toEqual([{ day: '2026-11-25', reserved_micro: costMicro(USAGE), calls: 1 }])
  })

  it('answers a repeated description from the cache without calling the model or counting the client', async () => {
    const { send, generate, ipCount, d1 } = setup()
    await send({ description: 'Decode the zebracorn base64 then pretty-print the JSON' })
    const again = await send({ description: '  decode the ZEBRACORN BASE64   then pretty-print the json' }, { ip: '198.51.100.9' })
    expect(again.status).toBe(200)
    const body = await again.json() as { cached: boolean; steps: Array<{ utilityId: string }>; why: string[] }
    expect(body.cached).toBe(true)
    expect(body.steps.map(s => s.utilityId)).toEqual(['base64_decode', 'json_pretty'])
    expect(body.why).toHaveLength(2)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(ipCount()).toBe(1)
    // the description and the address are not stored anywhere
    const dump = JSON.stringify([
      d1.sqlite.prepare('SELECT * FROM ai_answer_cache').all(),
      d1.sqlite.prepare('SELECT * FROM ai_ip_daily').all(),
    ])
    expect(dump).not.toMatch(/zebracorn|203\.0\.113|198\.51\.100/i)
  })

  it('checks a cached answer again and asks the model when nothing in it is still valid', async () => {
    const { send, generate, d1 } = setup()
    await send({ description: 'decode base64' })
    d1.sqlite.prepare('UPDATE ai_answer_cache SET steps = ?').run(JSON.stringify([{ utilityId: 'custom_js', params: { code: 'x' }, why: '' }]))
    const res = await send({ description: 'decode base64' })
    expect((await res.json() as { cached: boolean }).cached).toBe(false)
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('drops unknown utilities, bad params and code steps, and says so in notes', async () => {
    const { send } = setup({
      reply: () => answer([
        { utilityId: 'base64_decode', params: [{ name: 'nonsense', value: '1' }], why: 'decode' },
        { utilityId: 'make_it_pretty', params: [], why: 'invented' },
        { utilityId: 'custom_js', params: [{ name: 'code', value: 'fetch("//evil")' }], why: 'code' },
        { utilityId: 'json_pretty', params: [{ name: 'indent', value: 'lots' }], why: 'bad number' },
        { utilityId: 'aes_decrypt', params: [{ name: 'iterations', value: '999999999' }], why: 'out of range' },
        { utilityId: 'aes_decrypt', params: [{ name: 'mode', value: 'ECB' }], why: 'not an option' },
        { utilityId: 'html_to_markdown', params: [], why: 'needs the DOM' },
      ], 'Could not find a prettifier.'),
    })
    const res = await send({ description: 'decode and prettify' })
    expect(res.status).toBe(200)
    const body = await res.json() as { steps: Array<{ utilityId: string; params: object }>; why: string[]; notes: string }
    expect(body.steps).toHaveLength(1)
    expect(body.steps[0]).toMatchObject({ utilityId: 'base64_decode', params: {} })
    expect(body.why).toEqual(['decode'])
    expect(body.notes).toContain('Could not find a prettifier.')
    for (const id of ['make_it_pretty', 'custom_js', 'json_pretty', 'html_to_markdown']) expect(body.notes).toContain(id)
    expect(body.notes).toMatch(/aes_decrypt: iterations/)
    expect(body.notes).toMatch(/aes_decrypt: mode/)
    expect(JSON.stringify(body.steps)).not.toContain('evil')
  })

  it('coerces each value by its parameter kind', () => {
    const num = { kind: 'number', label: 'n' } as const
    expect(coerceValue(num, ' 4 ')).toEqual({ ok: true, value: 4 })
    expect(coerceValue(num, '')).toMatchObject({ ok: false })
    expect(coerceValue(num, 'four')).toMatchObject({ ok: false })
    const bool = { kind: 'boolean', label: 'b' } as const
    expect(coerceValue(bool, 'TRUE')).toEqual({ ok: true, value: true })
    expect(coerceValue(bool, 'false')).toEqual({ ok: true, value: false })
    expect(coerceValue(bool, 'yes')).toMatchObject({ ok: false })
    const multi: ParamSpec = { kind: 'multiselect', label: 'm', options: ['a', 'b'] }
    expect(coerceValue(multi, '["a","b"]')).toEqual({ ok: true, value: ['a', 'b'] })
    expect(coerceValue(multi, 'a, b')).toEqual({ ok: true, value: ['a', 'b'] })
    const kv = { kind: 'keyvalue', label: 'k' } as const
    expect(coerceValue(kv, '[["x","1"],["y",2]]')).toEqual({ ok: true, value: [['x', '1'], ['y', '2']] })
    expect(coerceValue(kv, 'x=1')).toMatchObject({ ok: false })
    expect(coerceValue({ kind: 'regex', label: 'r' }, '\\d+')).toEqual({ ok: true, value: '\\d+' })
  })

  it('rejects a number past its bound', async () => {
    const { send } = setup({ reply: () => answer([{ utilityId: 'json_pretty', params: [{ name: 'indent', value: '11' }], why: '' }]) })
    const res = await send({ description: 'format json widely' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'ai_unusable', notes: expect.stringMatching(/indent must be at most 10/) })
  })

  it('keeps at most 12 steps', async () => {
    const step = { utilityId: 'base64_decode', params: [], why: '' }
    const { send } = setup({ reply: () => answer(Array.from({ length: 15 }, () => step)) })
    const body = await (await send({ description: 'decode a lot' })).json() as { steps: unknown[]; notes: string }
    expect(body.steps).toHaveLength(12)
    expect(body.notes).toMatch(/more than 12 steps/)
  })

  it.each([
    ['no valid step', () => answer([{ utilityId: 'nope', params: [], why: '' }], 'Nothing fits.')],
    ['no step at all', () => answer([], 'This needs a spreadsheet.')],
    ['a cut-off answer', (): AiResponse => ({ text: '{"steps":[{"utilityId":"base64_', stopReason: 'max_tokens', usage: USAGE })],
    ['a refusal', (): AiResponse => ({ text: null, stopReason: 'refusal', usage: USAGE })],
  ])('answers 422 ai_unusable for %s, charges what it cost and caches nothing', async (_name, reply) => {
    const { send, generate, spend } = setup({ reply })
    const res = await send({ description: 'do my taxes' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'ai_unusable' })
    expect(spend()).toEqual([{ day: '2026-11-25', reserved_micro: costMicro(USAGE), calls: 1 }])
    await send({ description: 'do my taxes' })
    expect(generate).toHaveBeenCalledTimes(2)
  })
})

describe('POST /api/generate: limits', () => {
  it('allows 10 model calls per client per UTC day, refuses the 11th, and allows it the next day', async () => {
    const { send, generate, setNow } = setup()
    for (let i = 0; i < 10; i++) expect((await send({ description: `job ${i}` })).status).toBe(200)
    const eleventh = await send({ description: 'job 10' })
    expect(eleventh.status).toBe(429)
    expect(await eleventh.json()).toMatchObject({ code: 'ai_rate' })
    expect(eleventh.headers.get('retry-after')).toBe(String(12 * 3600))
    // another client still has its own allowance, and cached answers are free
    expect((await send({ description: 'job 10' }, { ip: '198.51.100.20' })).status).toBe(200)
    expect((await send({ description: 'job 3' })).status).toBe(200)
    expect(generate).toHaveBeenCalledTimes(11)
    setNow(Date.UTC(2026, 10, 26, 0, 0, 1))
    expect((await send({ description: 'job 11' })).status).toBe(200)
  })

  it('honours AI_IP_DAILY_LIMIT', async () => {
    const { send } = setup({ env: { AI_IP_DAILY_LIMIT: '1' } })
    expect((await send({ description: 'a' })).status).toBe(200)
    expect((await send({ description: 'b' })).status).toBe(429)
  })

  it('stops concurrent requests at the daily budget and uncounts the ones it turned away', async () => {
    const descriptions = Array.from({ length: 30 }, (_, i) => `job ${String(i).padStart(2, '0')}`)
    const w = worst(descriptions[0])
    const fits = 4
    const { send, generate, spend, ipCount } = setup({
      env: { AI_DAILY_BUDGET_USD: String((fits * w + w / 2) / 1e6) },
      reply: () => new Promise(resolve => setTimeout(() => resolve(DECODE_AND_FORMAT), 20)),
    })
    const results = await Promise.all(descriptions.map((description, i) => send({ description }, { ip: `192.0.2.${i}` })))
    const statuses = results.map(r => r.status)
    expect(statuses.filter(s => s === 200)).toHaveLength(fits)
    expect(statuses.filter(s => s === 503)).toHaveLength(30 - fits)
    expect(await results[statuses.indexOf(503)].json()).toMatchObject({ code: 'ai_budget' })
    expect(generate).toHaveBeenCalledTimes(fits)
    expect(ipCount()).toBe(fits)
    expect(spend()).toEqual([{ day: '2026-11-25', reserved_micro: fits * costMicro(USAGE), calls: fits }])
  })

  it('records an actual cost above the reservation, which closes the day', async () => {
    const w = worst('job 0')
    const { send, spend } = setup({
      env: { AI_DAILY_BUDGET_USD: String((2 * w + 1) / 1e6) },
      reply: () => ({ ...DECODE_AND_FORMAT, usage: { input_tokens: 0, output_tokens: 1024, cache_creation_input_tokens: 1e9 } }),
    })
    const statuses = []
    for (let i = 0; i < 4; i++) statuses.push((await send({ description: `job ${i}` }, { ip: `192.0.2.${i}` })).status)
    expect(statuses).toEqual([200, 503, 503, 503])
    expect((spend()[0] as { reserved_micro: number }).reserved_micro).toBeGreaterThan(2 * w)
  })
})

describe('POST /api/generate: upstream failures', () => {
  it('gives back the reservation and the count when the API answered with an error', async () => {
    const { send, spend, ipCount } = setup({ reply: () => { throw new AiUpstreamError('the model API answered 529', false) } })
    const res = await send({ description: 'decode base64' })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ code: 'ai_upstream' })
    expect(spend()).toEqual([{ day: '2026-11-25', reserved_micro: 0, calls: 0 }])
    expect(ipCount()).toBe(0)
  })

  it('keeps the worst case reserved when the call may have been billed', async () => {
    const { send, spend, ipCount } = setup({ reply: () => { throw new AiUpstreamError('the model API could not be reached', true) } })
    expect((await send({ description: 'decode base64' })).status).toBe(502)
    expect(spend()).toEqual([{ day: '2026-11-25', reserved_micro: worst('decode base64'), calls: 1 }])
    expect(ipCount()).toBe(1)
  })

  it('never logs the description', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { send } = setup({ reply: () => { throw new Error('boom') } })
    await send({ description: 'my secret project codename' })
    expect(JSON.stringify(error.mock.calls)).not.toContain('codename')
    error.mockRestore()
  })
})
